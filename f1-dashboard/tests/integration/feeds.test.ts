import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runtimeConfig } from '../../src/server/config/runtime-config.js';
import {
  classificationHtml,
  FEED_INTERVAL,
  renderFeed,
  xml,
} from '../../src/server/features/feeds/feed-model.js';
import { createFeedService } from '../../src/server/features/feeds/feed-service.js';
import {
  createFileFeedStore,
  emptyFeedState,
  validateFeedState,
} from '../../src/server/features/feeds/feed-store.js';
import type { FeedSnapshot, FeedStore } from '../../src/server/features/feeds/types.js';
import { createResultsService } from '../../src/server/features/results/results-service.js';
import { createServer } from '../../src/server/http/server.js';
import { normalizeJolpica } from '../../src/server/providers/normalization.js';
import { createUpstream } from '../../src/server/providers/upstream.js';
import { isRecord } from '../../src/shared/contracts/guards.js';
import type { FixtureOverride } from '../fixtures/providers.js';
import {
  classification,
  createFixtureFetcher,
  fixtureNow,
  races,
  timingSessions,
} from '../fixtures/providers.js';
import { createMemoryFeedStore } from '../support/feed-store.js';
import { listen } from '../support/http.js';
import { weekendFixture } from '../support/weekend-fixture.js';

const quiet = { log() {}, warn() {}, error() {} };
function setup({
  override,
  store = createMemoryFeedStore(),
}: { override?: FixtureOverride; store?: FeedStore } = {}) {
  let time = fixtureNow;
  const fixture = createFixtureFetcher({ override });
  const service = createResultsService({
    upstream: createUpstream({
      fetcher: fixture.fetcher,
      now: () => time,
      limiter: { take: async () => {}, block() {} },
    }),
    now: () => time,
  });
  const feeds = createFeedService({
    service,
    store,
    publicBaseUrl: 'https://gridline.example.com',
    now: () => time,
    logger: quiet,
  });
  return {
    feeds,
    service,
    store,
    calls: fixture.calls,
    setTime: (value: number) => {
      time = value;
    },
    advance: (value: number) => {
      time += value;
    },
  };
}
const items = (snapshot: Pick<FeedSnapshot, 'xml'> | null) =>
  snapshot!.xml.match(/<item>/g)?.length || 0;
const guids = (snapshot: Pick<FeedSnapshot, 'xml'> | null) =>
  [...snapshot!.xml.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map(
    (match) => match[1],
  );

void test('classification-only collection retains every session type without loading activity or track data', async () => {
  const { feeds, calls } = setup();
  await feeds.refresh();
  assert.equal(items(feeds.snapshot('results')), 9);
  for (const slug of [
    'practice-1',
    'practice-2',
    'practice-3',
    'qualifying',
    'sprint-qualifying',
    'sprint',
    'race',
  ])
    assert.match(feeds.snapshot('results')!.xml, new RegExp(`session=${slug}`));
  assert.ok(!calls.some((call) => /\/(pit|stints|laps|location)$/.test(call.url.pathname)));
  const jol = setup();
  const weekend = await jol.service.getWeekend('2026', '1');
  jol.calls.length = 0;
  assert.equal(
    (await jol.service.getClassification(weekend, 'race')).data[0]!.driver.name,
    'Max Verstappen',
  );
  assert.ok(jol.calls.every((call) => call.url.hostname === 'api.jolpi.ca'));
});

void test('full RSS classifications preserve phases, retirements, disqualification and unavailable points', () => {
  const rows = normalizeJolpica(classification, [], 'qualifying');
  const weekend = { name: 'Test & <GP>', circuit: 'A', location: 'B', country: 'C' },
    session = {
      name: 'Qualifying',
      slug: 'qualifying' as const,
      date: '2026-03-07',
      start: fixtureNow,
    };
  const html = classificationHtml(weekend, session, { source: 'Jolpica F1', data: rows }, false);
  assert.equal((html.match(/<tr>/g) || []).length, 4);
  assert.match(html, /Q1.*Q2.*Q3/);
  assert.match(html, /No points awarded/);
  assert.match(html, /Retired/);
  assert.match(html, /Test &amp; &lt;GP&gt;/);
  const race = classificationHtml(
    weekend,
    { ...session, slug: 'race' },
    {
      source: 'Jolpica F1',
      data: rows.map((row, index) => (index === 2 ? { ...row, status: 'Disqualified' } : row)),
    },
    true,
  );
  assert.match(race, /Awaiting publication/);
  assert.match(race, /Disqualified/);
  assert.match(race, /classification has changed/);
  assert.equal(xml('A\u0000 & <script>\ud800'), 'A &amp; &lt;script&gt;');
});

void test('initial backfill publishes chronologically so the most recent race leads the results feed', async () => {
  const x = setup({
    override: () => {
      x.advance(1);
    },
  });
  x.setTime(fixtureNow + 2 * 86400000);
  await x.feeds.refresh();
  assert.match(
    x.feeds.snapshot('results')!.xml.split('<item>')[1]!,
    /^<title>Results: Chinese Grand Prix — Race<\/title>/,
  );
});

void test('24-hour reminders include the boundary once, exclude started and unknown-time sessions and survive restarts', async () => {
  const x = setup();
  x.setTime(Date.parse('2026-03-14T06:59:59Z'));
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 1); // Qualifying in one second.
  x.advance(1000);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 2); // Race exactly 24 hours away.
  const before = guids(x.feeds.snapshot('upcoming'));
  x.advance(1000);
  await x.feeds.refresh();
  assert.deepEqual(guids(x.feeds.snapshot('upcoming')), before);
  const restarted = setup({ store: x.store });
  restarted.setTime(Date.parse('2026-03-14T07:00:01Z'));
  await restarted.feeds.refresh();
  assert.deepEqual(guids(restarted.feeds.snapshot('upcoming')), before);
  const unknown = setup({
    override: (url) =>
      url.hostname === 'api.jolpi.ca' && !/results|qualifying|sprint\//.test(url.pathname)
        ? new Response(
            JSON.stringify({
              MRData: {
                RaceTable: {
                  season: '2026',
                  Races: races.map((race) => ({
                    ...race,
                    time: undefined,
                    FirstPractice: undefined,
                    SecondPractice: undefined,
                    ThirdPractice: undefined,
                    Qualifying: undefined,
                    SprintQualifying: undefined,
                    Sprint: undefined,
                  })),
                },
              },
            }),
          )
        : url.pathname.endsWith('/sessions')
          ? new Response('[]')
          : undefined,
  });
  await unknown.feeds.refresh();
  assert.equal(items(unknown.feeds.snapshot('upcoming')), 0);
});

void test('rescheduling, Time TBC and confirmed cancellation notify once; missing timing cannot undo cancellation', async () => {
  let delay = 0,
    cancelled = false,
    missing = false,
    tbc = false;
  const x = setup({
    override: (url) => {
      if (url.pathname.endsWith('/sessions'))
        return new Response(
          JSON.stringify(
            missing
              ? []
              : timingSessions.map((row) =>
                  row.meeting_key === 102 && row.session_name === 'Race'
                    ? { ...row, is_cancelled: cancelled }
                    : row,
                ),
          ),
        );
      if (url.hostname === 'api.jolpi.ca' && !/results|qualifying|sprint\//.test(url.pathname)) {
        const round = /^\/ergast\/f1\/2026\/(\d+)\//.exec(url.pathname)?.[1];
        return new Response(
          JSON.stringify({
            MRData: {
              RaceTable: {
                season: '2026',
                Races: races
                  .filter((race) => !round || race.round === round)
                  .map((race) =>
                    race.round === '2'
                      ? {
                          ...race,
                          time: tbc ? undefined : `${String(7 + delay).padStart(2, '0')}:00:00Z`,
                        }
                      : race,
                  ),
              },
            },
          }),
        );
      }
    },
  });
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 1);
  delay = 2;
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 2);
  assert.match(x.feeds.snapshot('upcoming')!.xml, /Schedule update/);
  cancelled = true;
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 3);
  assert.match(x.feeds.snapshot('upcoming')!.xml, /Cancelled:/);
  missing = true;
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('upcoming')), 3);
  // A schedule moving to TBC remains an update for an already announced session.
  missing = false;
  cancelled = false;
  tbc = true;
  x.advance(900001);
  await x.feeds.refresh();
  // OpenF1 still provides a known start, so TBC is resolved rather than fabricated.
  assert.ok(items(x.feeds.snapshot('upcoming')) >= 4);
});

void test('an already announced session becoming Time TBC publishes one update without guessing a start', async () => {
  let tbc = false;
  const service = {
    getClassification: async () => {
      throw new Error('Unexpected classification request in a reminder test.');
    },
    getJolpica: async () => ({
      at: fixtureNow,
      stale: false,
      data: {
        MRData: {
          RaceTable: {
            season: '2026',
            Races: [
              {
                ...races[1],
                FirstPractice: undefined,
                Qualifying: undefined,
                Sprint: undefined,
                SprintQualifying: undefined,
                time: tbc ? undefined : races[1]!.time,
              },
            ],
          },
        },
      },
    }),
    getWeekend: async () =>
      weekendFixture({
        season: '2026',
        round: '2',
        name: 'Chinese Grand Prix',
        date: '2026-03-15',
        sessions: [
          {
            name: 'Race',
            slug: 'race',
            date: '2026-03-15',
            start: tbc ? null : Date.parse('2026-03-15T07:00:00Z'),
            cancelled: false,
            cancellationKnown: false,
          },
        ],
        metadata: { calendar: { stale: false }, timing: { at: null, stale: false } },
      }),
  };
  const feeds = createFeedService({
    service,
    store: createMemoryFeedStore(),
    publicBaseUrl: 'https://gridline.example.com',
    now: () => fixtureNow,
    logger: quiet,
  });
  await feeds.refresh();
  assert.equal(items(feeds.snapshot('upcoming')), 1);
  tbc = true;
  await feeds.refresh();
  assert.equal(items(feeds.snapshot('upcoming')), 2);
  assert.match(feeds.snapshot('upcoming')!.xml, /2026-03-15 · Time TBC/);
  await feeds.refresh();
  assert.equal(items(feeds.snapshot('upcoming')), 2);
});

void test('a missing calendar start can use the matched OpenF1 start for reminders and published practice results', async () => {
  const x = setup({
    override: (url) => {
      if (url.hostname === 'api.jolpi.ca' && !/results|qualifying|sprint\//.test(url.pathname))
        return new Response(
          JSON.stringify({
            MRData: {
              RaceTable: {
                season: '2026',
                Races: [
                  {
                    ...races[1],
                    FirstPractice: { date: '2026-03-14' },
                    Qualifying: undefined,
                    Sprint: undefined,
                    SprintQualifying: undefined,
                  },
                ],
              },
            },
          }),
        );
    },
  });
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('results')), 1);
  assert.match(x.feeds.snapshot('results')!.xml, /practice-1/);
});

void test('material result changes publish revisions, including reverted corrections; retrieval timestamps do not', async () => {
  let points = '25';
  const x = setup({
    override: (url) =>
      url.pathname.endsWith('/2026/1/results/')
        ? new Response(
            JSON.stringify({
              MRData: {
                RaceTable: {
                  season: '2026',
                  Races: [
                    {
                      ...races[0],
                      Results: classification.map((row, index) =>
                        index === 0 ? { ...row, points } : row,
                      ),
                    },
                  ],
                },
              },
            }),
          )
        : undefined,
  });
  await x.feeds.refresh();
  const original = x.feeds.snapshot('results');
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(x.feeds.snapshot('results')!.etag, original!.etag);
  points = '18';
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('results')), items(original) + 1);
  assert.match(x.feeds.snapshot('results')!.xml, /Corrected results/);
  points = '25';
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(items(x.feeds.snapshot('results')), items(original) + 2);
  const ids = guids(x.feeds.snapshot('results')).filter((id) =>
    id!.includes('results:2026:1:race:'),
  );
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
});

void test('partial failures retain successful items, stale snapshots and cache validators without publishing errors', async () => {
  let failed = false;
  const x = setup({
    override: (url) =>
      failed && url.pathname.endsWith('/session_result')
        ? new Response('{}', { status: 503 })
        : undefined,
  });
  await x.feeds.refresh();
  const before = x.feeds.snapshot('all');
  failed = true;
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(x.feeds.status().state, 'degraded');
  assert.equal(x.feeds.snapshot('all')!.stale, true);
  assert.equal(x.feeds.snapshot('all')!.etag, before!.etag);
});

void test('calendar outages before initialization give no snapshot; later outages preserve publication history', async () => {
  let failed = true;
  const x = setup({
    override: (url) =>
      failed && url.hostname === 'api.jolpi.ca'
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })
        : undefined,
  });
  await x.feeds.refresh();
  assert.equal(x.feeds.snapshot('all'), null);
  failed = false;
  x.advance(900001);
  await x.feeds.refresh();
  const ready = x.feeds.snapshot('all');
  assert.ok(ready);
  failed = true;
  x.advance(900001);
  await x.feeds.refresh();
  assert.equal(x.feeds.snapshot('all')!.etag, ready.etag);
});

void test('collector starts immediately, uses five-minute polling and coalesces concurrent refreshes', async () => {
  const x = setup();
  let tick: (() => void) | undefined,
    interval: number | undefined,
    cleared = false,
    release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const feeds = createFeedService({
    service: {
      ...x.service,
      getJolpica: async (...args) => {
        calls++;
        await gate;
        return x.service.getJolpica(...args);
      },
    },
    store: createMemoryFeedStore(),
    publicBaseUrl: 'https://gridline.example.com',
    now: () => fixtureNow,
    logger: quiet,
    setTimer: (fn, ms) => {
      tick = fn;
      interval = ms;
      return { unref() {} };
    },
    clearTimer: () => {
      cleared = true;
    },
  });
  await Promise.all([feeds.start(), feeds.start()]);
  const first = feeds.refresh(),
    second = feeds.refresh();
  assert.equal(first, second);
  release!();
  await first;
  assert.equal(calls, 1);
  assert.equal(interval, FEED_INTERVAL);
  assert.equal(interval, 300000);
  tick!();
  await feeds.refresh();
  assert.equal(calls, 2);
  await feeds.stop();
  assert.equal(cleared, true);
});

void test('shutdown stops further collection while an outstanding provider request completes', async () => {
  let release: (() => void) | undefined,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const x = setup();
  const feeds = createFeedService({
    service: {
      ...x.service,
      getJolpica: async () => {
        calls++;
        await gate;
        return x.service.getJolpica('current/races/');
      },
    },
    store: createMemoryFeedStore(),
    publicBaseUrl: 'https://gridline.example.com',
    logger: quiet,
    now: () => fixtureNow,
  });
  const refresh = feeds.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  const stopping = feeds.stop();
  release!();
  await Promise.all([refresh, stopping]);
  assert.equal(calls, 1);
  assert.equal(feeds.snapshot('all'), null);
  assert.equal(
    x.calls.some((call) => call.url.pathname.endsWith('/session_result')),
    false,
  );
});

void test('first collection limits backfill to two completed weekends and handles a new season with stable prior items', async () => {
  let year = '2026';
  const visited: string[] = [];
  const rows = [1, 2, 3, 4].map((round) => ({
    ...races[0],
    season: year,
    round: String(round),
    date: `${year}-03-${String(round * 2).padStart(2, '0')}`,
    FirstPractice: undefined,
    SecondPractice: undefined,
    ThirdPractice: undefined,
    Qualifying: undefined,
  }));
  const service = {
    getJolpica: async () => ({
      at: fixtureNow,
      data: {
        MRData: {
          RaceTable: {
            season: year,
            Races: rows.map((row) => ({
              ...row,
              season: year,
              date: row.date.replace(/^2026/, year),
            })),
          },
        },
      },
      stale: false,
    }),
    getWeekend: async (season: string | number, round: string | number) => {
      visited.push(`${season}:${round}`);
      return weekendFixture({
        season: String(season),
        round: String(round),
        name: 'Test GP',
        sessions: [
          {
            slug: 'race',
            name: 'Race',
            date: `${season}-03-01`,
            start: Date.parse(`${season}-03-01T00:00:00Z`),
            cancelled: false,
          },
        ],
        metadata: { calendar: { stale: false }, timing: { at: 1, stale: false } },
      });
    },
    getClassification: async () => ({
      status: 'available' as const,
      at: fixtureNow,
      stale: false,
      source: 'Jolpica F1',
      data: normalizeJolpica(classification, [], 'race'),
    }),
  };
  let now = fixtureNow;
  const feeds = createFeedService({
    service,
    store: createMemoryFeedStore(),
    publicBaseUrl: 'https://gridline.example.com',
    now: () => now,
    logger: quiet,
  });
  await feeds.refresh();
  assert.deepEqual(visited, ['2026:4', '2026:3']);
  year = '2027';
  now = Date.parse('2027-03-14T08:00:00Z');
  await feeds.refresh();
  const ids = guids(feeds.snapshot('results'));
  assert.equal(ids.length, 4);
  assert.ok(ids.some((id) => id!.includes(':2026:')) && ids.some((id) => id!.includes(':2027:')));
});

void test('atomic file storage, restart identity and failed writes preserve the last committed snapshot', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gridline-rss-'));
  try {
    const store = createFileFeedStore(directory),
      x = setup({ store });
    await x.feeds.refresh();
    const original = x.feeds.snapshot('all');
    const restored = setup({ store: createFileFeedStore(directory) });
    await restored.feeds.refresh();
    assert.equal(restored.feeds.snapshot('all')!.etag, original!.etag);
    assert.deepEqual(await readdir(directory), ['rss-state.json']);
    const saved = validateFeedState(
      JSON.parse(await readFile(path.join(directory, 'rss-state.json'), 'utf8')),
    );
    const broken = setup({
      store: {
        load: async () => saved,
        save: async () => {
          throw new Error('Disk full');
        },
      },
    });
    await broken.feeds.refresh();
    assert.equal(broken.feeds.snapshot('all')!.etag, original!.etag);
    assert.equal(broken.feeds.status().state, 'degraded');
    await writeFile(path.join(directory, 'rss-state.json'), '{broken', 'utf8');
    const corrupt = setup({ store });
    await corrupt.feeds.refresh();
    assert.equal(corrupt.feeds.snapshot('all'), null);
    assert.equal(corrupt.feeds.status().state, 'failed');
    assert.equal(await readFile(path.join(directory, 'rss-state.json'), 'utf8'), '{broken');
  } finally {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'gridline-rss-'),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

void test('RSS HTTP routes support GET/HEAD, ETag precedence, stale metadata, health and invalid routes', async () => {
  const x = setup();
  const server = createServer({ service: x.service, feeds: x.feeds });
  const base = await listen(server);
  try {
    const early = await fetch(base + '/feeds/all.xml');
    assert.equal(early.status, 503);
    assert.equal(early.headers.get('Retry-After'), '60');
    const health: unknown = await (await fetch(base + '/healthz')).json();
    assert.ok(isRecord(health));
    assert.equal(health.status, 'ok');
    await x.feeds.refresh();
    const response = await fetch(base + '/feeds/all.xml');
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type')!, /application\/rss\+xml/);
    assert.match(body, /https:\/\/gridline.example.com\/#\/weekend/);
    const etag = response.headers.get('ETag')!,
      modified = response.headers.get('Last-Modified')!;
    assert.equal(
      (await fetch(base + '/feeds/all.xml', { headers: { 'If-None-Match': etag } })).status,
      304,
    );
    assert.equal(
      (await fetch(base + '/feeds/all.xml', { headers: { 'If-None-Match': `W/${etag}` } })).status,
      304,
    );
    assert.equal(
      (await fetch(base + '/feeds/all.xml', { headers: { 'If-Modified-Since': modified } })).status,
      304,
    );
    assert.equal(
      (
        await fetch(base + '/feeds/all.xml', {
          headers: { 'If-None-Match': '"different"', 'If-Modified-Since': modified },
        })
      ).status,
      200,
    );
    assert.equal(await (await fetch(base + '/feeds/all.xml', { method: 'HEAD' })).text(), '');
    assert.equal((await fetch(base + '/feeds/unknown.xml')).status, 404);
    assert.equal((await fetch(base + '/feeds/all.xml', { method: 'POST' })).status, 405);
    assert.match(body, /&amp;driver|session=/);
    assert.equal(new Set(guids(x.feeds.snapshot('all'))).size, items(x.feeds.snapshot('all')));
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});

void test('runtime configuration accepts root public origins and rejects ambiguous URLs and invalid ports', () => {
  assert.equal(runtimeConfig({}).host, '127.0.0.1');
  assert.equal(
    runtimeConfig({
      HOST: '0.0.0.0',
      PORT: '5174',
      PUBLIC_BASE_URL: 'https://gridline.example.com/',
    }).publicBaseUrl,
    'https://gridline.example.com',
  );
  assert.equal(runtimeConfig({ PORT: '5174' }).publicBaseUrl, 'http://127.0.0.1:5174');
  for (const PUBLIC_BASE_URL of [
    'file:///tmp',
    'https://user:secret@example.com',
    'https://example.com/subpath',
    'https://example.com/?key=a',
    'https://example.com/#x',
  ])
    assert.throws(() => runtimeConfig({ PUBLIC_BASE_URL }));
  for (const PORT of ['0', '65536', '51.73', 'hello']) assert.throws(() => runtimeConfig({ PORT }));
  assert.throws(() => validateFeedState({ ...emptyFeedState(fixtureNow), version: 2 }));
});

void test('feeds expose only their latest 100 publications while preserving the complete stored identities', async () => {
  const x = setup();
  await x.feeds.refresh();
  const state = await x.store.load();
  const sample = state!.items.find((item) => item.kind === 'results');
  state!.items = Array.from({ length: 120 }, (_, index) => ({
    ...sample!,
    guid: sample!.guid.replace(/:v\d+$/, `:v${index + 1}`),
    publishedAt: fixtureNow - index * 1000,
  }));
  validateFeedState(state);
  const rendered = renderFeed(state!, 'results', 'https://gridline.example.com');
  assert.equal(items(rendered), 100);
  assert.equal(state!.items.length, 120);
});
