import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { errorMessage } from '../../shared/contracts/guards.js';
import { projectRoot } from '../config/paths.js';
import type { FeedReader } from '../features/feeds/types.js';
import type { ResultsService } from '../features/results/results-service.js';
import { createResultsService } from '../features/results/results-service.js';
import { ProviderError } from '../providers/upstream.js';
import { handleApi } from './api.js';
import { handleFeeds } from './feeds.js';
import { sendJson } from './responses.js';
const types: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};
export function createServer({
  service = createResultsService(),
  feeds = null,
  staticRoot = path.join(projectRoot, 'dist'),
}: { service?: ResultsService; feeds?: FeedReader | null; staticRoot?: string } = {}): http.Server {
  const root = path.resolve(staticRoot);
  const handleRequest = async (request: http.IncomingMessage, response: http.ServerResponse) => {
    const requestUrl = request.url || '/';
    try {
      if (!['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const url = new URL(requestUrl, 'http://localhost'),
        pathname = decodeURIComponent(url.pathname);
      if (pathname === '/healthz') {
        sendJson(request, response, 200, {
          status: 'ok',
          feeds: feeds?.status() || { state: 'disabled' },
        });
        return;
      }
      if (pathname.startsWith('/feeds/')) {
        handleFeeds(request, response, pathname, feeds);
        return;
      }
      if (pathname.startsWith('/api/')) {
        await handleApi(request, response, url, pathname, service);
        return;
      }
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response
        .writeHead(200, {
          'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (requestUrl.startsWith('/api/')) {
        const provider = error instanceof ProviderError ? error : null;
        const status = provider?.status === 404 ? 404 : provider?.status === 429 ? 429 : 502;
        sendJson(
          request,
          response,
          status,
          { message: errorMessage(error) },
          provider?.retryAt
            ? {
                'Retry-After': String(
                  Math.max(1, Math.ceil((provider.retryAt - Date.now()) / 1000)),
                ),
              }
            : {},
        );
      } else if (requestUrl.startsWith('/feeds/'))
        sendJson(
          request,
          response,
          503,
          { message: 'RSS is temporarily unavailable.' },
          { 'Retry-After': '60' },
        );
      else response.writeHead(404).end(request.method === 'HEAD' ? undefined : 'Not found');
    }
  };
  return http.createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : undefined);
    });
  });
}
