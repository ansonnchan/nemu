import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { id, validateBatch, dayBounds, summarize, type Batch, type Interval } from './model.js';

export type Item = Record<string, any> & { pk: string; sk: string };

export interface Store {
  get(pk: string, sk: string): Promise<Item | undefined>;
  put(item: Item, absent?: boolean): Promise<void>;
  pair(tokenKey: string, session: Item, now: number): Promise<void>;
  ingest(batch: Batch, hash: string, now: number): Promise<void>;
  intervals(device: string, from: string, to: string): Promise<Interval[]>;
  archive(batch: Batch, hash: string): Promise<void>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const hash = (s: string) => createHash('sha256').update(s).digest('hex');

const token = () => randomBytes(32).toString('hex');
const validToken = z.string().regex(/^[a-f0-9]{64}$/);

export class Service {
  constructor(
    public store: Store,
    public now = () => new Date(),
  ) {}
  seconds() {
    return Math.floor(this.now().getTime() / 1000);
  }
  async register(input: unknown) {
    const v = z.object({ device_id: id, secret: validToken }).strict().parse(input);
    const pk = `DEVICE#${v.device_id}`,
      secretHash = hash(v.secret);
    const existing = await this.store.get(pk, 'META');
    if (existing) {
      if (existing.secretHash !== secretHash) throw new HttpError(409, 'Device already registered');
      return { deviceId: v.device_id };
    }
    try {
      await this.store.put(
        { pk, sk: 'META', secretHash, createdAt: this.now().toISOString(), lastSynced: null },
        true,
      );
    } catch {
      const found = await this.store.get(pk, 'META');
      if (found?.secretHash !== secretHash) throw new HttpError(409, 'Device already registered');
    }
    return { deviceId: v.device_id };
  }
  async device(auth: string | undefined) {
    const m = /^Bearer ([a-f0-9]{32}):([a-f0-9]{64})$/.exec(auth ?? '');
    if (!m) throw new HttpError(401, 'Device authentication required');
    const d = await this.store.get(`DEVICE#${m[1]}`, 'META');
    const supplied = hash(m[2]);
    if (
      !d ||
      typeof d.secretHash !== 'string' ||
      d.secretHash.length !== supplied.length ||
      !timingSafeEqual(Buffer.from(d.secretHash), Buffer.from(supplied))
    )
      throw new HttpError(401, 'Device authentication required');
    return m[1];
  }
  async createPair(device: string) {
    const t = token();
    await this.store.put(
      { pk: `PAIR#${hash(t)}`, sk: 'TOKEN', device, expiresAt: this.seconds() + 600 },
      true,
    );
    return { token: t, expiresIn: 600 };
  }
  async redeem(input: unknown) {
    const { token: t } = z.object({ token: validToken }).strict().parse(input);
    const pk = `PAIR#${hash(t)}`;
    const p = await this.store.get(pk, 'TOKEN');
    if (!p || p.expiresAt <= this.seconds())
      throw new HttpError(410, 'Pairing link expired or already used');
    const sessionToken = token();
    try {
      await this.store.pair(
        pk,
        {
          pk: `BROWSER#${hash(sessionToken)}`,
          sk: 'SESSION',
          device: p.device,
          expiresAt: this.seconds() + 30 * 86400,
        },
        this.seconds(),
      );
    } catch {
      throw new HttpError(410, 'Pairing link expired or already used');
    }
    return sessionToken;
  }
  async browser(cookie: string | undefined) {
    const value = /(?:^|;\s*)nemu_session=([a-f0-9]{64})(?:;|$)/.exec(cookie ?? '')?.[1];
    if (!value) throw new HttpError(401, 'Pair your device to continue');
    const s = await this.store.get(`BROWSER#${hash(value)}`, 'SESSION');
    if (!s || s.expiresAt <= this.seconds())
      throw new HttpError(401, 'Pair your device to continue');
    return s.device as string;
  }
  async ingest(device: string, input: unknown) {
    let b: Batch;
    try {
      b = validateBatch(input, this.now());
    } catch {
      throw new HttpError(400, 'Invalid activity batch');
    }
    if (b.device_id !== device) throw new HttpError(403, 'Device does not match');
    const digest = hash(JSON.stringify(b));
    const meta = await this.store.get(`DEVICE#${device}`, 'META');
    const receipt =
      (await this.store.get(`DEVICE#${device}`, `BATCH#${b.batch_id}`)) ??
      (meta?.lastBatchID === b.batch_id ? { hash: meta.lastBatchHash } : undefined);
    if (receipt) {
      if (receipt.hash !== digest) throw new HttpError(409, 'Batch ID already used');
      return { accepted: true, duplicate: true };
    }
    await this.store.archive(b, digest);
    try {
      await this.store.ingest(b, digest, this.seconds());
    } catch (err) {
      const r = await this.store.get(`DEVICE#${device}`, `BATCH#${b.batch_id}`);
      if (r?.hash === digest) return { accepted: true, duplicate: true };
      throw new HttpError(409, 'Batch conflicts with previously accepted activity');
    }
    return { accepted: true, duplicate: false };
  }
  async day(device: string, date: string, zone: string) {
    let bounds;
    try {
      bounds = dayBounds(date, zone);
    } catch {
      throw new HttpError(400, 'Invalid date or timezone');
    }
    const pk = `DEVICE#${device}`,
      sk = `DAY#${zone}#${date}`;
    if (bounds.start > this.now().getTime() + 86400000)
      throw new HttpError(400, 'Future day unavailable');
    const meta = await this.store.get(pk, 'META');
    const data = await this.store.intervals(
      device,
      new Date(bounds.start - 86400000).toISOString(),
      new Date(bounds.end).toISOString(),
    );
    if (
      !data.some(
        (v) => Date.parse(v.ended_at) > bounds.start && Date.parse(v.started_at) < bounds.end,
      ) &&
      bounds.end < this.now().getTime() - 30 * 86400000
    ) {
      const cached = await this.store.get(pk, sk);
      if (cached && cached.expiresAt > this.seconds()) return { ...cached.summary, archived: true };
      throw new HttpError(404, 'This day is outside the available history');
    }
    const summary = summarize(data, date, zone, meta?.lastSynced ?? null);
    const existing = await this.store.get(pk, sk);
    await this.store.put({
      pk,
      sk,
      summary: { ...summary, timeline: [] },
      expiresAt:
        existing && existing.expiresAt > this.seconds()
          ? existing.expiresAt
          : this.seconds() + 365 * 86400,
    });
    return summary;
  }
}
