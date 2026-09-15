// A filesystem adapter for local development. Starts empty; never creates activity.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Store, Item } from './service.js';
import type { Batch, Interval } from './model.js';
export class LocalStore implements Store {
  private data: Record<string, Item> = {};
  private chain: Promise<unknown> = Promise.resolve();
  constructor(public dir: string) {}
  async init() {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      this.data = JSON.parse(await fs.readFile(join(this.dir, 'data.json'), 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return this;
  }
  key(pk: string, sk: string) {
    return pk + '|' + sk;
  }
  async get(pk: string, sk: string) {
    await this.chain;
    const v = this.data[this.key(pk, sk)];
    return v ? structuredClone(v) : undefined;
  }
  // Serialize writes and publish a copied state only after its file replacement succeeds.
  private write(fn: (data: Record<string, Item>) => void) {
    const next = this.chain.then(async () => {
      const draft = structuredClone(this.data);
      fn(draft);
      const file = await fs.open(join(this.dir, 'data.tmp'), 'w', 0o600);
      try {
        await file.writeFile(JSON.stringify(draft));
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(join(this.dir, 'data.tmp'), join(this.dir, 'data.json'));
      this.data = draft;
    });
    this.chain = next.catch(() => {});
    return next;
  }
  async put(item: Item, absent = false) {
    await this.write((d) => {
      const k = this.key(item.pk, item.sk);
      if (absent && d[k]) throw Error('conflict');
      d[k] = item;
    });
  }
  async pair(pk: string, session: Item, now: number) {
    await this.write((d) => {
      const k = this.key(pk, 'TOKEN');
      if (!d[k] || d[k].expiresAt <= now) throw Error('expired');
      delete d[k];
      d[this.key(session.pk, session.sk)] = session;
    });
  }
  async archive(b: Batch, digest: string) {
    const dir = join(this.dir, 'raw', b.device_id);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(join(dir, `${b.batch_id}-${digest}.json`), JSON.stringify(b), {
      mode: 0o600,
    });
  }
  async ingest(b: Batch, digest: string, now: number) {
    await this.write((d) => {
      const pk = `DEVICE#${b.device_id}`,
        meta = d[this.key(pk, 'META')],
        key = this.key(pk, `BATCH#${b.batch_id}`);
      if (!meta || d[key] || meta.lastEnd > b.intervals[0].started_at) throw Error('conflict');
      d[key] = { pk, sk: `BATCH#${b.batch_id}`, hash: digest, expiresAt: now + 30 * 86400 };
      for (const v of b.intervals) {
        const k = this.key(pk, `INTERVAL#${v.started_at}#${v.id}`);
        if (d[k]) throw Error('conflict');
        d[k] = {
          pk,
          sk: `INTERVAL#${v.started_at}#${v.id}`,
          interval: v,
          expiresAt: now + 30 * 86400,
        };
      }
      meta.lastEnd = b.intervals.at(-1)!.ended_at;
      meta.lastBatchID = b.batch_id;
      meta.lastBatchHash = digest;
      meta.lastSynced = new Date(now * 1000).toISOString();
    });
  }
  async intervals(device: string, from: string, to: string) {
    await this.chain;
    return Object.values(this.data)
      .filter(
        (v) =>
          v.expiresAt > Math.floor(Date.now() / 1000) &&
          v.pk === `DEVICE#${device}` &&
          v.sk >= `INTERVAL#${from}` &&
          v.sk < `INTERVAL#${to}`,
      )
      .sort((a, b) => a.sk.localeCompare(b.sk))
      .map((v) => v.interval as Interval);
  }
}
