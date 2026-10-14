import { startApplication, installShutdown } from '../server.mjs';
import { createResultsService } from '../results-service.mjs';
import { createUpstream } from '../upstream.mjs';
import { createFixtureFetcher, fixtureNow } from './fixtures.mjs';

const fixture = createFixtureFetcher();
const upstream = createUpstream({fetcher:fixture.fetcher,now:() => fixtureNow,limiter:{take:async () => {},block() {}}});
const service = createResultsService({upstream,now:() => fixtureNow});
installShutdown(await startApplication({service,now:() => fixtureNow}));
