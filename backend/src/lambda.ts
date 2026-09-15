// HTTP boundary: validate origins, select the auth flow, and return safe errors and session cookies.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodError } from 'zod';
import { AWSStore } from './aws.js';
import { Service, HttpError } from './service.js';
const service = new Service(new AWSStore(process.env.TABLE_NAME!, process.env.RAW_BUCKET!));
export const createHandler =
  (service: Service, origin: string) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    const reply = (statusCode: number, data: unknown, cookies?: string[]) => ({
      statusCode,
      headers,
      body: JSON.stringify(data),
      cookies,
    });
    try {
      const method = event.requestContext.http.method,
        path = event.rawPath;
      if (method === 'POST' && event.headers.origin && event.headers.origin !== origin)
        throw new HttpError(403, 'Origin not allowed');
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString()
        : (event.body ?? '');
      if (Buffer.byteLength(raw) > 256 * 1024) throw new HttpError(413, 'Request too large');
      let input: unknown = {};
      if (raw) {
        try {
          input = JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'Invalid JSON');
        }
      }
      if (method === 'POST' && path === '/api/devices')
        return reply(200, await service.register(input));
      if (method === 'POST' && path === '/api/pairing')
        return reply(
          200,
          await service.createPair(await service.device(event.headers.authorization)),
        );
      if (method === 'POST' && path === '/api/pair') {
        if (event.headers.origin !== origin) throw new HttpError(403, 'Origin required');
        const t = await service.redeem(input);
        return reply(200, { paired: true }, [
          `nemu_session=${t}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
        ]);
      }
      if (method === 'POST' && path === '/api/batches')
        return reply(
          200,
          await service.ingest(await service.device(event.headers.authorization), input),
        );
      if (method === 'POST' && path === '/api/logout')
        return reply(200, { paired: false }, [
          'nemu_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
        ]);
      if (method === 'GET' && path === '/api/day') {
        const device = await service.browser(event.cookies?.join('; ') ?? event.headers.cookie);
        return reply(
          200,
          await service.day(
            device,
            event.queryStringParameters?.date ?? '',
            event.queryStringParameters?.timezone ?? '',
          ),
        );
      }
      return reply(404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof HttpError) return reply(error.status, { error: error.message });
      if (error instanceof ZodError) return reply(400, { error: 'Invalid request' });
      console.error(
        JSON.stringify({ event: 'request_failed', requestId: event.requestContext.requestId }),
      );
      return reply(500, { error: 'Something went wrong. Please try again.' });
    }
  };

export const handler = createHandler(service, process.env.WEB_ORIGIN!);
