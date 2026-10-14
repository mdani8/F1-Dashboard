import assert from 'node:assert/strict';
import test from 'node:test';
import { createResultsService } from '../../src/server/features/results/results-service.js';
import { createUpstream } from '../../src/server/providers/upstream.js';
import {
  buildTrackGeometry,
  matchCircuit,
  referenceLaps,
  referenceSessions,
  validateTrack,
} from '../../src/shared/domain/track-geometry.js';
import type { FixtureOverride } from '../fixtures/providers.js';
import {
  createFixtureFetcher,
  fixtureNow,
  timingSessions,
  trackLap,
  trackPositions,
} from '../fixtures/providers.js';

const session = timingSessions.find(
  (row) => row.session_name === 'Qualifying' && row.circuit_key === 10,
);
const lap = trackLap(session!);
const weekend = {
  circuit: 'Albert Park Grand Prix Circuit',
  location: 'Melbourne',
  country: 'Australia',
};
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
    service: createResultsService({ upstream, now: () => time }),
    advance: (amount: number) => {
      time += amount;
    },
  };
}

void test('track sectors split at published timing boundaries and form a continuous closed lap', () => {
  const geometry = buildTrackGeometry(lap, trackPositions(lap), session!.session_key);
  assert.deepEqual(
    geometry!.sectors.map((sector) => sector.time),
    [26, 29, 25.123],
  );
  assert.deepEqual(geometry!.sectors[0]!.points.at(-1), geometry!.sectors[1]!.points[0]);
  assert.deepEqual(geometry!.sectors[1]!.points.at(-1), geometry!.sectors[2]!.points[0]);
  assert.deepEqual(geometry!.sectors[2]!.points.at(-1), geometry!.start);
  assert.ok(geometry!.sectors.every((sector) => sector.points.length > 20));
  assert.ok(
    geometry!.sectors
      .flatMap((sector) => sector.points)
      .every(([x, y]) => x >= 0 && x <= 640 && y >= 0 && y <= 360),
  );
  // Sector 1 is 26 seconds of this 80.123 second trace, rather than one third of its shape.
  const split = geometry!.sectors[0]!.points.at(-1);
  const angle = (26 / 80.123) * 2 * Math.PI;
  assert.ok(Math.abs(split![0] - (320 + 168 * Math.cos(angle))) < 0.1);
  assert.ok(Math.abs(split![1] - (180 - 128 * Math.sin(angle))) < 0.1);
});

void test('partial, sparse, unrelated and empty position traces stay unavailable', () => {
  const points = trackPositions(lap);
  assert.equal(buildTrackGeometry(lap, points.slice(10), session!.session_key), null);
  assert.equal(
    buildTrackGeometry(
      lap,
      points.filter((_, index) => index % 10 === 0),
      session!.session_key,
    ),
    null,
  );
  assert.equal(
    buildTrackGeometry(
      lap,
      points.map((row) => ({ ...row, driver_number: 44 })),
      session!.session_key,
    ),
    null,
  );
  assert.equal(buildTrackGeometry(lap, points, 999), null);
  assert.equal(
    buildTrackGeometry(
      lap,
      points.map((row) => ({ ...row, x: 0, y: 0 })),
      session!.session_key,
    ),
    null,
  );
});

void test('reference selection excludes incomplete laps, pit out laps, future and cancelled sessions', () => {
  assert.deepEqual(
    referenceLaps(
      [
        lap,
        { ...lap, lap_duration: 60 },
        { ...lap, duration_sector_2: null },
        { ...lap, is_pit_out_lap: true },
        { ...lap, date_start: 'invalid' },
      ],
      fixtureNow,
    ),
    [lap],
  );
  assert.equal(referenceLaps([lap], 0).length, 0);
  assert.equal(referenceSessions([{ ...session!, is_cancelled: true }], 10, fixtureNow).length, 0);
  assert.equal(referenceSessions([session!], 10, 0).length, 0);
  assert.equal(matchCircuit(weekend, timingSessions), 10);
  assert.equal(matchCircuit(weekend, [...timingSessions, { ...session!, circuit_key: 999 }]), null);
  assert.equal(matchCircuit({ ...weekend, country: 'China' }, timingSessions), null);
});

void test('track service coalesces requests, caches geometry and retains it independently after failure', async () => {
  let fail = false;
  const fixture = setup((url) =>
    url.pathname.endsWith('/location') && fail ? new Response('{}', { status: 503 }) : undefined,
  );
  const [a, b] = await Promise.all([
    fixture.service.getTrack('2026', '1'),
    fixture.service.getTrack('2026', '1'),
  ]);
  assert.equal(a.status, 'available');
  assert.equal(a, b);
  assert.equal(a.reference!.season, '2026');
  assert.equal(fixture.calls.filter((row) => row.url.pathname.endsWith('/location')).length, 1);
  validateTrack(a);
  await fixture.service.getTrack('2026', '1');
  assert.equal(fixture.calls.filter((row) => row.url.pathname.endsWith('/location')).length, 1);
  fail = true;
  fixture.advance(2000);
  const stale = await fixture.service.getTrack('2026', '1', true);
  assert.equal(stale.stale, true);
  assert.equal(stale.at, a.at);
  assert.deepEqual(stale.geometry, a.geometry);
  assert.equal((await fixture.service.getSession('2026', '1', 'race')).results.status, 'available');
});

void test('a future weekend can use an explicitly dated prior-season reference', async () => {
  const previous = {
    ...session!,
    year: 2025,
    session_key: 9001,
    date_start: '2025-03-07T05:00:00Z',
    date_end: '2025-03-07T06:00:00Z',
  };
  const oldLap = trackLap(previous);
  const fixture = setup((url) => {
    if (url.pathname.endsWith('/sessions') && url.searchParams.get('year') === '2025')
      return new Response(JSON.stringify([previous]));
    if (url.pathname.endsWith('/sessions'))
      return new Response(
        JSON.stringify(timingSessions.map((row) => ({ ...row, date_end: '2026-12-31T00:00:00Z' }))),
      );
    if (url.pathname.endsWith('/laps') && url.searchParams.get('session_key') === '9001')
      return new Response(JSON.stringify([oldLap]));
    if (url.pathname.endsWith('/location'))
      return new Response(JSON.stringify(trackPositions(oldLap)));
  });
  const result = await fixture.service.getTrack('2026', '1');
  assert.equal(result.status, 'available');
  assert.equal(result.reference!.season, '2025');
  assert.equal(result.reference!.sessionKey, 9001);
});

void test('missing circuit geometry and malformed responses do not fabricate a map', async () => {
  const empty = setup((url) => (url.pathname.endsWith('/laps') ? new Response('[]') : undefined));
  assert.equal((await empty.service.getTrack('2026', '1')).status, 'awaiting');
  const failed = setup((url) =>
    url.pathname.endsWith('/location') ? new Response('{}') : undefined,
  );
  assert.equal((await failed.service.getTrack('2026', '1')).status, 'failed');
  assert.throws(() =>
    validateTrack({
      status: 'available',
      circuitId: 'albert_park',
      at: fixtureNow,
      reference: {},
      geometry: { sectors: [] },
    }),
  );
});
