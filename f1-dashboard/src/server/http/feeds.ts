import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FeedKind, FeedReader } from '../features/feeds/types.js';
import { sendJson } from './responses.js';

export function handleFeeds(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  feeds: FeedReader | null,
): void {
  const kind = /^\/feeds\/(all|results|upcoming)\.xml$/.exec(pathname)?.[1] as FeedKind | undefined;
  if (!kind) {
    response
      .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(request.method === 'HEAD' ? undefined : 'Unknown RSS feed.');
    return;
  }
  const snapshot = feeds?.snapshot(kind);
  if (!snapshot) {
    sendJson(
      request,
      response,
      503,
      {
        message: 'RSS history is initializing or unavailable. Check /healthz and application logs.',
      },
      { 'Retry-After': '60' },
    );
    return;
  }
  const tag = request.headers['if-none-match'];
  // Preserve millisecond precision: startup can publish multiple revisions in one HTTP-date second.
  const matches = tag
    ? tag
        .split(',')
        .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === snapshot.etag)
    : Date.parse(request.headers['if-modified-since'] || '') >= snapshot.modifiedAt;
  response.writeHead(matches ? 304 : 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=60, must-revalidate',
    ETag: snapshot.etag,
    'Last-Modified': snapshot.lastModified,
    'X-Feed-Stale': String(snapshot.stale),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(matches || request.method === 'HEAD' ? undefined : snapshot.xml);
}
