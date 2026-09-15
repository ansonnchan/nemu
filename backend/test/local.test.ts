// Real temporary files exercise concurrent pairing, HTTP cookies, and durable retry recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore } from '../src/local.js';
import { Service } from '../src/service.js';
import { createHandler } from '../src/lambda.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const device = 'a'.repeat(32),
  secret = 'b'.repeat(64);
test('durable local adapter has atomic single-use pairing under concurrency', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nemu-backend-'));
  try {
    const store = await new LocalStore(dir).init();
    const s = new Service(store);
    await s.register({ device_id: device, secret });
    const p = await s.createPair(device);
    const result = await Promise.allSettled([
      s.redeem({ token: p.token }),
      s.redeem({ token: p.token }),
    ]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    const restored = new Service(await new LocalStore(dir).init());
    assert.equal(await restored.device(`Bearer ${device}:${secret}`), device);
    await assert.rejects(restored.redeem({ token: p.token }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('HTTP boundary enforces origin, auth, malformed JSON and secure cookies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nemu-http-'));
  try {
    const s = new Service(await new LocalStore(dir).init()),
      handler = createHandler(s, 'https://nemu.example');
    const event = (
      path: string,
      body: string,
      headers: Record<string, string> = {},
    ): APIGatewayProxyEventV2 =>
      ({
        rawPath: path,
        headers,
        body,
        requestContext: { http: { method: 'POST' }, requestId: 'test' },
      }) as APIGatewayProxyEventV2;
    assert.equal((await handler(event('/api/devices', '{'))).statusCode, 400);
    assert.equal(
      (await handler(event('/api/pair', '{}', { origin: 'https://evil.example' }))).statusCode,
      403,
    );
    assert.equal((await handler(event('/api/batches', '{}'))).statusCode, 401);
    assert.equal(
      (await handler(event('/api/sync-requests', '{}', { origin: 'https://nemu.example' })))
        .statusCode,
      401,
    );
    await s.register({ device_id: device, secret });
    const p = await s.createPair(device);
    const r = await handler(
      event('/api/pair', JSON.stringify({ token: p.token }), { origin: 'https://nemu.example' }),
    );
    assert.equal(r.statusCode, 200);
    assert.match(r.cookies![0], /HttpOnly; Secure; SameSite=Strict/);
    const session = await s.redeem({ token: (await s.createPair(device)).token });
    assert.equal(
      (
        await handler(
          event('/api/sync-requests', '{}', {
            origin: 'https://nemu.example',
            cookie: `nemu_session=${session}`,
          }),
        )
      ).statusCode,
      202,
    );
    const poll = await handler(
      event('/api/sync-requests/poll', '{}', {
        authorization: `Bearer ${device}:${secret}`,
      }),
    );
    assert.deepEqual(JSON.parse(poll.body!), { requested: true });
    assert.equal(
      (
        await handler(
          event('/api/pair', JSON.stringify({ token: p.token }), {
            origin: 'https://nemu.example',
          }),
        )
      ).statusCode,
      410,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('latest batch remains retryable after the short-lived receipt expires', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nemu-retry-'));
  try {
    const store = await new LocalStore(dir).init(),
      s = new Service(store);
    await s.register({ device_id: device, secret });
    const batch = {
      schema_version: 1,
      batch_id: 'c'.repeat(32),
      device_id: device,
      intervals: [
        {
          id: 'd'.repeat(32),
          session_id: 'e'.repeat(32),
          kind: 'app',
          app_name: 'Editor',
          bundle_id: 'app.editor',
          started_at: '2020-01-01T00:00:00Z',
          ended_at: '2020-01-01T01:00:00Z',
          end_reason: 'shutdown',
        },
      ],
    };
    await s.ingest(device, batch);
    const original = store.get.bind(store);
    store.get = async (pk, sk) => (sk.startsWith('BATCH#') ? undefined : original(pk, sk));
    assert.equal((await s.ingest(device, batch)).duplicate, true);
    const day = await s.day(device, '2020-01-01', 'UTC');
    assert.equal(day.activeSeconds, 3600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
