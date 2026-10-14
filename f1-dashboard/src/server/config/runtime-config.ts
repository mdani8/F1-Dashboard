import path from 'node:path';
import { projectRoot } from './paths.js';

export function runtimeConfig(env = process.env) {
  const rawPort = env.PORT || '5173';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
    throw new Error('PORT must be an integer from 1 to 65535.');
  const port = Number(rawPort),
    host = env.HOST || '127.0.0.1';
  const url = new URL(env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'PUBLIC_BASE_URL must be an HTTP(S) origin at the domain root, without credentials, a path, query or fragment.',
    );
  return {
    port,
    host,
    publicBaseUrl: url.origin,
    dataDirectory: path.resolve(env.DATA_DIR || path.join(projectRoot, '.gridline-data')),
  };
}
