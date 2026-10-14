import { installShutdown, startApplication } from '#server/app';
import { createResultsService } from '#server/features/results/results-service';
import { createUpstream } from '#server/providers/upstream';
import { createFixtureFetcher, fixtureNow } from '../fixtures/providers.js';

const fixture = createFixtureFetcher();
const upstream = createUpstream({
  fetcher: fixture.fetcher,
  now: () => fixtureNow,
  limiter: { take: async () => {}, block() {} },
});
const service = createResultsService({ upstream, now: () => fixtureNow });
installShutdown(await startApplication({ service, now: () => fixtureNow }));
