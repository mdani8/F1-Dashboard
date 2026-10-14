import { errorMessage } from '../shared/contracts/guards.js';

import { runtimeConfig } from './config/runtime-config.js';
import { createFeedService } from './features/feeds/feed-service.js';
import { createFileFeedStore } from './features/feeds/feed-store.js';
import { createResultsService } from './features/results/results-service.js';
import { createServer } from './http/server.js';
export async function startApplication({
  config = runtimeConfig(),
  service = createResultsService(),
  logger = console,
  now = Date.now,
} = {}) {
  const feeds = createFeedService({
    service,
    store: createFileFeedStore(config.dataDirectory),
    publicBaseUrl: config.publicBaseUrl,
    logger,
    now,
  });
  const server = createServer({ service, feeds });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });
  logger.log(
    `Gridline listening on ${config.host}:${config.port}; public URL ${config.publicBaseUrl}`,
  );
  void feeds.start();
  return {
    server,
    feeds,
    async stop() {
      await Promise.all([
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeIdleConnections();
        }),
        feeds.stop(),
      ]);
    },
  };
}
export function installShutdown(
  app: Awaited<ReturnType<typeof startApplication>>,
  logger = console,
) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => {
      logger.error('Shutdown timed out.');
      process.exit(1);
    }, 25000);
    timeout.unref();
    app
      .stop()
      .then(() => {
        clearTimeout(timeout);
        process.exitCode = 0;
      })
      .catch((error) => {
        logger.error(errorMessage(error));
        process.exitCode = 1;
      });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
