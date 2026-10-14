import type { IncomingMessage, ServerResponse } from 'node:http';
export function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(request.method === 'HEAD' ? undefined : JSON.stringify(value));
}
