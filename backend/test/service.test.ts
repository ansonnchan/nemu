// Synthetic intervals cover authorization, idempotency, and day calculations without AWS calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Service, HttpError, type Store, type Item, hash } from '../src/service.js';
import { summarize, dayBounds, validateBatch, type Interval, type Batch } from '../src/model.js';
class Memory implements Store {
  data = new Map<string, Item>();
  raw = new Map<string, Batch>();
  key(p: string, s: string) {
    return p + '|' + s;
  }
  async get(p: string, s: string) {
    return this.data.get(this.key(p, s));
  }
  async put(i: Item, absent = false) {
    const k = this.key(i.pk, i.sk);
    if (absent && this.data.has(k)) throw Error('condition');
    this.data.set(k, i);
  }
  async pair(pk: string, s: Item, now: number) {
    const p = await this.get(pk, 'TOKEN');
    if (!p || p.expiresAt <= now) throw Error('condition');
    this.data.delete(this.key(pk, 'TOKEN'));
    await this.put(s, true);
  }
  async requestSync(device: string, now: number) {
    await this.put({ pk: `DEVICE#${device}`, sk: 'COMMAND#SYNC', expiresAt: now + 600 });
  }
  async takeSync(device: string, now: number) {
    const key = this.key(`DEVICE#${device}`, 'COMMAND#SYNC'),
      command = this.data.get(key);
    this.data.delete(key);
    return Boolean(command && command.expiresAt > now);
  }
  async archive(b: Batch) {
    this.raw.set(b.batch_id, b);
  }
  async ingest(b: Batch, digest: string, now: number) {
    const pk = `DEVICE#${b.device_id}`,
      m = await this.get(pk, 'META');
    if ((await this.get(pk, `BATCH#${b.batch_id}`)) || m?.lastEnd > b.intervals[0].started_at)
      throw Error('condition');
    await this.put({ pk, sk: `BATCH#${b.batch_id}`, hash: digest });
    for (const i of b.intervals)
      await this.put({ pk, sk: `INTERVAL#${i.started_at}#${i.id}`, interval: i });
    await this.put({
      ...m!,
      lastEnd: b.intervals.at(-1)!.ended_at,
      lastSynced: new Date(now * 1000).toISOString(),
    });
  }
  async intervals(device: string) {
    return [...this.data.values()]
      .filter((i) => i.pk === `DEVICE#${device}` && i.sk.startsWith('INTERVAL#'))
      .map((i) => i.interval);
  }
}
const device = 'a'.repeat(32),
  secret = 'b'.repeat(64),
  now = new Date('2026-03-09T12:00:00Z');
function interval(overrides: Partial<Interval> = {}): Interval {
  return {
    id: '1'.repeat(32),
    session_id: '2'.repeat(32),
    kind: 'app',
    app_name: 'Editor',
    bundle_id: 'app.editor',
    started_at: '2026-03-08T08:00:00.000Z',
    ended_at: '2026-03-08T09:00:00.000Z',
    end_reason: 'app_switch',
    ...overrides,
  };
}
const batch = (overrides: Partial<Batch> = {}): Batch => ({
  schema_version: 1,
  batch_id: 'c'.repeat(32),
  device_id: device,
  intervals: [interval()],
  ...overrides,
});
async function setup() {
  const store = new Memory(),
    service = new Service(store, () => now);
  await service.register({ device_id: device, secret });
  return { store, service };
}
test('registration retries and device authorization', async () => {
  const { service } = await setup();
  await service.register({ device_id: device, secret });
  assert.equal(await service.device(`Bearer ${device}:${secret}`), device);
  await assert.rejects(service.device(`Bearer ${device}:${'c'.repeat(64)}`), HttpError);
  await assert.rejects(service.register({ device_id: device, secret: 'c'.repeat(64) }), HttpError);
});
test('pairing is single use, expires, and yields scoped browser session', async () => {
  const { service, store } = await setup();
  const p = await service.createPair(device);
  const t = await service.redeem({ token: p.token });
  assert.equal(await service.browser(`nemu_session=${t}`), device);
  await assert.rejects(service.redeem({ token: p.token }), HttpError);
  await assert.rejects(service.browser(''), HttpError);
  const p2 = await service.createPair(device);
  store.data.get(store.key(`PAIR#${hash(p2.token)}`, 'TOKEN'))!.expiresAt = 0;
  await assert.rejects(service.redeem({ token: p2.token }), HttpError);
});
test('browser sync requests are consumed once by the paired device', async () => {
  const { service } = await setup();
  await service.requestSync(device);
  assert.deepEqual(await service.takeSync(device), { requested: true });
  assert.deepEqual(await service.takeSync(device), { requested: false });
});
test('duplicate upload is idempotent and changed payload conflicts', async () => {
  const { service, store } = await setup();
  assert.equal((await service.ingest(device, batch())).duplicate, false);
  assert.equal((await service.ingest(device, batch())).duplicate, true);
  assert.equal((await store.intervals(device)).length, 1);
  await assert.rejects(
    service.ingest(device, batch({ intervals: [interval({ app_name: 'Changed' })] })),
    HttpError,
  );
  await assert.rejects(service.ingest('d'.repeat(32), batch()), HttpError);
});
test('reject malformed, overlapping and future intervals', () => {
  for (const i of [
    interval({ ended_at: 'bad' }),
    interval({ ended_at: interval().started_at }),
    interval({ ended_at: '2030-01-01T00:00:00Z' }),
    interval({ kind: 'idle' }),
  ])
    assert.throws(() => validateBatch(batch({ intervals: [i] }), now));
  assert.throws(() =>
    validateBatch(batch({ intervals: [interval(), interval({ id: '3'.repeat(32) })] }), now),
  );
});
test('calendar days honor DST and midnight clipping', () => {
  assert.equal(
    dayBounds('2026-03-08', 'America/Los_Angeles').end -
      dayBounds('2026-03-08', 'America/Los_Angeles').start,
    23 * 3600000,
  );
  assert.equal(
    dayBounds('2026-11-01', 'America/Los_Angeles').end -
      dayBounds('2026-11-01', 'America/Los_Angeles').start,
    25 * 3600000,
  );
  const s = summarize(
    [interval({ started_at: '2026-03-08T07:30:00Z', ended_at: '2026-03-08T08:30:00Z' })],
    '2026-03-08',
    'America/Los_Angeles',
    null,
  );
  assert.equal(s.activeSeconds, 1800);
  assert.equal(s.appSwitches, 1);
  assert.throws(() => dayBounds('2026-02-30', 'UTC'));
});
test('checkpoint fragments aggregate without fabricating switches or apps', () => {
  const s = summarize(
    [
      interval({ end_reason: 'checkpoint' }),
      interval({
        id: '3'.repeat(32),
        started_at: '2026-03-08T09:00:00.000Z',
        ended_at: '2026-03-08T09:30:00.000Z',
        end_reason: 'idle',
      }),
      interval({
        id: '4'.repeat(32),
        session_id: '5'.repeat(32),
        kind: 'idle',
        app_name: '',
        bundle_id: '',
        started_at: '2026-03-08T09:30:00.000Z',
        ended_at: '2026-03-08T10:00:00.000Z',
        end_reason: 'resume',
      }),
    ],
    '2026-03-08',
    'UTC',
    null,
  );
  assert.equal(s.activeSeconds, 5400);
  assert.equal(s.idleSeconds, 1800);
  assert.equal(s.longestSession.seconds, 5400);
  assert.equal(s.appSwitches, 0);
  assert.equal(s.apps.length, 1);
  assert.equal(s.timeline.length, 2);
});
test('empty paired device produces factual zeros', async () => {
  const { service } = await setup();
  const s = await service.day(device, '2026-03-09', 'UTC');
  assert.equal(s.activeSeconds, 0);
  assert.equal(s.lastSynced, null);
});

test('long offline queues are accepted without discarding their original dates', () => {
  const b = validateBatch(
    batch({
      intervals: [
        interval({ started_at: '2020-01-01T00:00:00Z', ended_at: '2020-01-01T01:00:00Z' }),
      ],
    }),
    now,
  );
  assert.equal(b.intervals[0].started_at, '2020-01-01T00:00:00.000Z');
});

test('a midnight switch belongs to the new calendar day', () => {
  const v = interval({ started_at: '2026-03-08T23:30:00Z', ended_at: '2026-03-09T00:00:00Z' });
  assert.equal(summarize([v], '2026-03-08', 'UTC', null).appSwitches, 0);
  const next = summarize([v], '2026-03-09', 'UTC', null);
  assert.equal(next.appSwitches, 1);
  assert.equal(next.activeSeconds, 0);
});
