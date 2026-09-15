// Local-only HTTP adapter for the same service layer; the filesystem store starts with no activity.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createHandler } from './lambda.js';
import { Service } from './service.js';
import { LocalStore } from './local.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
const store = await new LocalStore(resolve('../.scratch/local-backend')).init();
const handle = createHandler(
  new Service(store),
  process.env.DEV_WEB_ORIGIN ?? 'http://localhost:5173',
);
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) {
      res.writeHead(413);
      res.end();
      return;
    }
    chunks.push(chunk);
  }
  const url = new URL(req.url ?? '/', 'http://localhost:8787');
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')]),
    ),
    cookies: req.headers.cookie?.split('; '),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: Buffer.concat(chunks).toString(),
    isBase64Encoded: false,
    requestContext: { requestId: 'local', http: { method: req.method ?? 'GET' } },
  } as APIGatewayProxyEventV2;
  try {
    const out = await handle(event);
    res.writeHead(out.statusCode ?? 200, {
      ...out.headers,
      ...(out.cookies ? { 'Set-Cookie': out.cookies } : {}),
    } as Record<string, string>);
    res.end(out.body);
  } catch {
    res.writeHead(500);
    res.end('{"error":"Local service unavailable"}');
  }
}).listen(8787, '127.0.0.1', () =>
  console.log('Local API: http://localhost:8787 · empty until real data is uploaded'),
);
