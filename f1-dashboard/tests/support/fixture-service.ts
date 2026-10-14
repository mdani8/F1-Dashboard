import { createResultsService } from '../../src/server/features/results/results-service.js';
import { createUpstream } from '../../src/server/providers/upstream.js';
import type { FixtureOverride } from '../fixtures/providers.js';
import { createFixtureFetcher, fixtureNow } from '../fixtures/providers.js';
export function createFixtureService({
  override,
  now = () => fixtureNow,
}: { override?: FixtureOverride; now?: () => number } = {}) {
  const fixture = createFixtureFetcher({ override });
  const upstream = createUpstream({
    fetcher: fixture.fetcher,
    now,
    limiter: { take: async () => {}, block() {} },
  });
  return { fixture, service: createResultsService({ upstream, now }) };
}
