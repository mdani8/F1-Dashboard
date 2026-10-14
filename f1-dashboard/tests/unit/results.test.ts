import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeekendClient } from '../../src/client/api/weekend-client.js';
import { createResultsService } from '../../src/server/features/results/results-service.js';
import {
  matchDriver,
  matchMeeting,
  normalizeJolpica,
  normalizeLaps,
  normalizeOpenResults,
  normalizePits,
} from '../../src/server/providers/normalization.js';
import {
  createRateLimiter,
  createUpstream,
  ProviderError,
} from '../../src/server/providers/upstream.js';
import { validateSession } from '../../src/shared/contracts/validation.js';
import {
  defaultSession,
  formatDuration,
  parseWeekendRoute,
  resultTTL,
  shouldPoll,
  weekendHref,
} from '../../src/shared/domain/weekend.js';
import type { FixtureOverride } from '../fixtures/providers.js';
import {
  classification,
  createFixtureFetcher,
  fixtureNow,
  laps,
  openResults,
  pits,
  races,
  roster,
  stints,
  timingSessions,
} from '../fixtures/providers.js';

function setup(override?: FixtureOverride) {
  let time = fixtureNow;
  const fixture = createFixtureFetcher({ override });
  const upstream = createUpstream({
    fetcher: fixture.fetcher,
    now: () => time,
    limiter: { take: async () => {}, block: () => {} },
  });
  return {
    ...fixture,
    upstream,
    service: createResultsService({ upstream, now: () => time }),
    advance: (amount: number) => {
      time += amount;
    },
    setTime: (value: number) => {
      time = value;
    },
  };
}

void test('normal and sprint weekends map to unique provider sessions in chronological order', async () => {
  const { service } = setup();
  const normal = await service.getWeekend('2026', '1');
  const sprint = await service.getWeekend('2026', '2');
  assert.deepEqual(
    normal.sessions.map((row) => row.slug),
    ['practice-1', 'practice-2', 'practice-3', 'qualifying', 'race'],
  );
  assert.deepEqual(
    sprint.sessions.map((row) => row.slug),
    ['practice-1', 'sprint-qualifying', 'sprint', 'qualifying', 'race'],
  );
  assert.equal(normal.meetingKey, 101);
  assert.ok(sprint.sessions.every((row) => Number.isInteger(row.sessionKey)));
  assert.equal(defaultSession(sprint.sessions, fixtureNow), 'qualifying');
  assert.equal(defaultSession(sprint.sessions, 0), 'practice-1');
});

void test('ambiguous or wrong circuit matches are rejected; country aliases match', () => {
  const raceTiming = timingSessions.find(
    (row) => row.meeting_key === 101 && row.session_name === 'Race',
  );
  assert.equal(
    matchMeeting(races[0]!, '2026', [raceTiming!, { ...raceTiming!, meeting_key: 999 }]),
    null,
  );
  assert.equal(
    matchMeeting(races[0]!, '2026', [
      { ...raceTiming!, location: 'Wrong city', circuit_short_name: 'Wrong circuit' },
    ]),
    null,
  );
  assert.equal(
    matchMeeting(
      {
        ...races[0]!,
        Circuit: { ...races[0]!.Circuit, Location: { locality: 'Austin', country: 'USA' } },
      },
      '2026',
      [{ ...raceTiming!, location: 'Austin', country_name: 'United States' }],
    ),
    101,
  );
});

void test('session-specific driver numbers are matched by identity without guessing ambiguous numbers', () => {
  assert.equal(matchDriver(classification[0]!.Driver, roster)!.driver_number, 1);
  assert.equal(
    matchDriver(classification[0]!.Driver, [...roster, { ...roster[0], driver_number: 33 }]),
    null,
  );
  assert.equal(
    matchDriver({ ...classification[0]!.Driver, code: undefined }, roster)!.driver_number,
    1,
  );
  assert.equal(
    matchDriver({ givenName: 'Different', familyName: 'Driver', permanentNumber: '1' }, roster),
    null,
  );
});

void test('race, sprint and qualifying results retain published points and missing phases', async () => {
  const { service, advance } = setup();
  advance(2 * 86400000);
  const race = await service.getSession('2026', '1', 'race');
  assert.equal(race.results.data[0]!.driver.number, 1);
  assert.equal(race.results.data[0]!.points, 25);
  assert.equal(race.results.data[2]!.points, null);
  assert.equal(race.results.data[2]!.status, 'Retired');
  assert.equal(
    normalizeJolpica(
      [{ ...classification[2]!, points: '0', status: 'Disqualified' }],
      roster,
      'race',
    )[0]!.points,
    0,
  );
  const qualifying = await service.getSession('2026', '1', 'qualifying');
  assert.deepEqual(qualifying.results.data[2]!.qTimes, ['1:20.123', null, null]);
  assert.equal((await service.getSession('2026', '2', 'sprint')).results.source, 'Jolpica F1');
});

void test('practice and sprint qualifying use published OpenF1 classifications, including disqualification', async () => {
  const { service } = setup();
  const practice = await service.getSession('2026', '2', 'practice-1');
  assert.equal(practice.results.data[0]!.bestLap, 80.123);
  assert.equal(practice.results.data[2]!.status, 'Disqualified');
  assert.equal(practice.results.data[0]!.points, null);
  const qualifying = await service.getSession('2026', '2', 'sprint-qualifying');
  assert.deepEqual(qualifying.results.data[0]!.qTimes, [80.123, 79.123, 78.123]);
  assert.deepEqual(
    normalizeOpenResults(
      [{ ...openResults[0]!, duration: [80, null] }],
      roster,
      'sprint-qualifying',
    )[0]!.qTimes,
    [80, null, null],
  );
});

void test('scheduled and cancelled sessions return explicit states without requesting activity data', async () => {
  const fixture = setup((url) =>
    url.pathname.endsWith('/sessions')
      ? new Response(
          JSON.stringify(
            timingSessions.map((row) =>
              row.session_name === 'Sprint Qualifying' ? { ...row, is_cancelled: true } : row,
            ),
          ),
        )
      : undefined,
  );
  assert.equal((await fixture.service.getSession('2026', '2', 'race')).results.status, 'scheduled');
  assert.equal(
    (await fixture.service.getSession('2026', '2', 'sprint-qualifying')).results.status,
    'cancelled',
  );
  assert.ok(fixture.calls.every((call) => !/\/pit|\/stints|\/drivers\?/.test(call.url.href)));
});

void test('lap timing is loaded only for the selected roster driver and retains missing fields', async () => {
  const fixture = setup();
  await fixture.service.getSession('2026', '1', 'race');
  assert.equal(fixture.calls.filter((call) => call.url.pathname.endsWith('/laps')).length, 0);
  const detail = await fixture.service.getLaps('2026', '1', 'race', 1);
  assert.equal(detail.laps.data[0]!.duration, null);
  assert.equal(detail.laps.data[0]!.outLap, true);
  assert.equal(detail.laps.data[1]!.pitLap, true);
  assert.equal(detail.laps.data[2]!.sectors[1], null);
  assert.equal(detail.laps.data[2]!.compound, 'HARD');
  assert.ok(
    fixture.calls
      .find((call) => call.url.pathname.endsWith('/laps'))!
      .url.searchParams.get('driver_number') === '1',
  );
  await assert.rejects(
    fixture.service.getLaps('2026', '1', 'race', 33),
    (error) => error instanceof ProviderError && error.status === 404,
  );
  assert.equal(
    normalizeLaps(laps, [...stints, { ...stints[0]!, compound: 'SOFT' }], pits)[0]!.compound,
    null,
  );
  assert.equal(
    normalizePits([{ driver_number: 1, pit_duration: 22.5 }], roster)[0]!.stopDuration,
    null,
  );
});

void test('awaiting publication transitions to available after the active cache expires', async () => {
  let published = false;
  const fixture = setup((url) =>
    url.pathname.endsWith('/session_result') && !published ? new Response('[]') : undefined,
  );
  assert.equal(
    (await fixture.service.getSession('2026', '2', 'practice-1')).results.status,
    'awaiting',
  );
  published = true;
  fixture.advance(60001);
  assert.equal(
    (await fixture.service.getSession('2026', '2', 'practice-1')).results.status,
    'available',
  );
});

void test('pit failures remain independent and cached activity keeps its original retrieval time', async () => {
  let fail = false;
  const fixture = setup((url) =>
    url.pathname.endsWith('/pit') && fail ? new Response('{}', { status: 503 }) : undefined,
  );
  const before = await fixture.service.getSession('2026', '1', 'race');
  fail = true;
  fixture.advance(2000);
  const after = await fixture.service.getSession('2026', '1', 'race', true);
  assert.equal(after.pits.stale, true);
  assert.equal(after.pits.at, before.pits.at);
  assert.equal(after.results.stale, false);
  assert.equal(after.tires.stale, false);
  assert.equal(after.results.status, 'available');
  const uncached = setup((url) =>
    url.pathname.endsWith('/pit') ? new Response('{}', { status: 503 }) : undefined,
  );
  assert.equal((await uncached.service.getSession('2026', '1', 'race')).pits.status, 'failed');
});

void test('protected recent data waits for free publication; malformed responses fail independently', async () => {
  const recent = setup((url) =>
    url.pathname.endsWith('/pit') ? new Response('{}', { status: 403 }) : undefined,
  );
  assert.equal(
    (await recent.service.getSession('2026', '2', 'qualifying')).pits.status,
    'awaiting',
  );
  const invalid = setup((url) =>
    url.pathname.endsWith('/stints') ? new Response('{}') : undefined,
  );
  const result = await invalid.service.getSession('2026', '1', 'race');
  assert.equal(result.tires.status, 'failed');
  assert.equal(result.results.status, 'available');
});

void test('upstream requests coalesce, identify the app and obey expiry and retry backoff', async () => {
  const fixture = setup();
  await Promise.all([
    fixture.service.getWeekend('2026', '1'),
    fixture.service.getWeekend('2026', '1'),
  ]);
  assert.equal(fixture.calls.filter((call) => call.url.hostname === 'api.jolpi.ca').length, 1);
  assert.equal(fixture.calls[0]!.options.headers['User-Agent'], 'Gridline/1.0.0');
  let time = 1000,
    calls = 0;
  const upstream = createUpstream({
    now: () => time,
    limiter: { take: async () => {}, block: () => {} },
    fetcher: async () => {
      calls++;
      return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } });
    },
  });
  await assert.rejects(
    upstream.load('openf1', 'pit'),
    (error) => error instanceof ProviderError && error.retryAt === 121000,
  );
  await assert.rejects(upstream.load('openf1', 'pit', { force: true }), ProviderError);
  assert.equal(calls, 1);
  time = 121001;
  await assert.rejects(upstream.load('openf1', 'pit'), ProviderError);
  assert.equal(calls, 2);
});

void test('malformed activity records do not replace a previous successful section', async () => {
  let malformed = false;
  const fixture = setup((url) =>
    url.pathname.endsWith('/stints') && malformed ? new Response('[{}]') : undefined,
  );
  const previous = await fixture.service.getSession('2026', '1', 'race');
  malformed = true;
  fixture.advance(2000);
  const current = await fixture.service.getSession('2026', '1', 'race', true);
  assert.equal(current.tires.stale, true);
  assert.deepEqual(current.tires.data, previous.tires.data);
  assert.equal(current.results.stale, false);
});

void test('central limits enforce two starts per second, sustained caps and provider cooldown', async () => {
  let time = 0;
  const limiter = createRateLimiter({
    now: () => time,
    wait: async (amount) => {
      time += amount;
    },
  });
  await limiter.take('openf1');
  await limiter.take('openf1');
  assert.equal(time, 0);
  await limiter.take('openf1');
  assert.equal(time, 1000);
  for (let i = 3; i < 24; i++) await limiter.take('openf1');
  await assert.rejects(
    limiter.take('openf1'),
    (error) => error instanceof ProviderError && error.status === 429 && error.retryAt === 60000,
  );
  await limiter.take('jolpica');
  limiter.block('jolpica', 90000);
  await assert.rejects(
    limiter.take('jolpica'),
    (error) => error instanceof ProviderError && error.retryAt === 90000,
  );
  time = 60001;
  await limiter.take('openf1');
});

void test('browser cache survives unavailable transport and blocked storage without hiding navigation aborts', async () => {
  const data = await setup().service.getSession('2026', '1', 'race');
  let fail = false,
    time = 0;
  const client = createWeekendClient({
    now: () => time,
    storage: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    },
    fetcher: async () => {
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify(data));
    },
  });
  await client.load('/session', { validate: validateSession });
  fail = true;
  time = 60001;
  const stale = await client.load('/session', { force: true, validate: validateSession });
  assert.equal(stale.results.stale, true);
  assert.equal(stale.results.at, data.results.at);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.load('/session', { signal: controller.signal }),
    (error) => error instanceof Error && error.name === 'AbortError',
  );
});

void test('routes, refresh window and duration formatting cover direct links and UTC boundaries', async () => {
  assert.deepEqual(parseWeekendRoute(weekendHref('2026', '2', 'qualifying', 44)), {
    season: '2026',
    round: '2',
    session: 'qualifying',
    driver: 44,
  });
  assert.equal(parseWeekendRoute('#calendar'), null);
  assert.equal(parseWeekendRoute('#/weekend/2026/2?driver=0')!.invalid, true);
  assert.equal(parseWeekendRoute('#/weekend/2026/2?session=unknown')!.invalid, true);
  const weekend = await setup().service.getWeekend('2026', '2');
  assert.equal(shouldPoll(weekend, { now: fixtureNow }), true);
  assert.equal(shouldPoll(weekend, { now: fixtureNow, visible: false }), false);
  assert.equal(shouldPoll(weekend, { now: fixtureNow, active: false }), false);
  assert.equal(shouldPoll(weekend, { now: Date.parse('2026-03-17T00:00:00Z') }), false);
  assert.equal(resultTTL(weekend, fixtureNow), 60000);
  assert.equal(resultTTL(weekend, 0), 900000);
  assert.equal(formatDuration(79.1), '1:19.100');
  assert.equal(formatDuration(null), '—');
});
