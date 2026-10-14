import { TTL } from '../../src/shared/domain/cache-policy.js';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataClient } from '../../src/client/api/dashboard-client.js';
import { validateCalendar, validateStandings } from '../../src/shared/contracts/jolpica.js';
import {
  displayDate,
  displaySession,
  nextRace,
  nextSession,
  sessions,
  timestamp,
} from '../../src/shared/domain/calendar.js';

const race = {
  round: '1',
  raceName: 'Test Grand Prix',
  Circuit: { circuitName: 'Test Circuit' },
  date: '2026-10-04',
  time: '23:00:00Z',
  FirstPractice: { date: '2026-10-02', time: '10:00:00Z' },
  Qualifying: { date: '2026-10-03', time: '14:00:00Z' },
  SprintQualifying: { date: '2026-10-02', time: '14:00:00Z' },
  Sprint: { date: '2026-10-03', time: '10:00:00Z' },
};
const calendar = { MRData: { RaceTable: { season: '2026', Races: [race] } } };
function store() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
  };
}
void test('timed dates cross into the viewer’s next day; date-only dates do not shift', () => {
  assert.match(displaySession(race, 'Asia/Tokyo'), /5 Oct · 08:00/);
  assert.equal(displayDate({ date: '2026-10-04' }, 'America/Los_Angeles', { day: 'numeric' }), '4');
  assert.match(displaySession({ date: '2026-10-04' }, 'Europe/Brussels'), /4 Oct · Time TBC/);
  assert.equal(timestamp({ date: '2026-10-04' }), null);
});
void test('sprint sessions are chronological and absent sessions are omitted', () => {
  assert.deepEqual(
    sessions(race).map((s) => s.name),
    ['Practice 1', 'Sprint qualifying', 'Sprint', 'Qualifying', 'Race'],
  );
  assert.equal(
    sessions({ ...race, SprintShootout: race.SprintQualifying }).filter(
      (s) => s.name === 'Sprint qualifying',
    ).length,
    1,
  );
  assert.deepEqual(
    sessions({ date: '2026-10-04' }).map((s) => s.name),
    ['Race'],
  );
});
void test('next race and session advance; completed season and empty season return null', () => {
  assert.equal(nextSession(race, Date.parse('2026-10-03T12:00:00Z'))!.name, 'Qualifying');
  assert.equal(nextRace([race], Date.parse('2026-10-05T00:00:00Z')), null);
  assert.equal(nextRace([], 0), null);
  assert.equal(
    nextRace([{ ...race, time: undefined }], Date.parse('2026-10-04T20:00:00Z'))!.round,
    '1',
  );
});
void test('cached data stays fresh for 15 minutes; force and expiry request new data', async () => {
  let now = 1000,
    calls = 0;
  const client = createDataClient({
    storage: store(),
    now: () => now,
    fetcher: async () => {
      calls++;
      return new Response(JSON.stringify(calendar));
    },
  });
  await client.load('calendar', 'current/races/', validateCalendar);
  now += TTL - 1;
  await client.load('calendar', 'current/races/', validateCalendar);
  assert.equal(calls, 1);
  now++;
  await client.load('calendar', 'current/races/', validateCalendar);
  assert.equal(calls, 2);
  await client.load('calendar', 'current/races/', validateCalendar, true);
  assert.equal(calls, 3);
});
void test('failed refresh retains stale successful data; an uncached section rejects', async () => {
  let fail = false;
  const client = createDataClient({
    storage: store(),
    fetcher: async () => {
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify(calendar));
    },
  });
  await client.load('calendar', 'current/races/', validateCalendar);
  fail = true;
  const result = await client.load('calendar', 'current/races/', validateCalendar, true);
  assert.equal(result.stale, true);
  assert.deepEqual(result.data, calendar);
  await assert.rejects(
    client.load('drivers', '2026/driverstandings/', () => {}),
    /offline/,
  );
});
void test('HTTP throttling, malformed payloads, and blocked storage are handled', async () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const client = createDataClient({
    storage: blocked,
    fetcher: async () => new Response(JSON.stringify(calendar)),
  });
  assert.equal((await client.load('calendar', 'current/races/', validateCalendar)).stale, false);
  const throttled = createDataClient({ fetcher: async () => new Response(null, { status: 429 }) });
  await assert.rejects(throttled.load('calendar', 'current/races/', validateCalendar), /busy/);
  const invalid = createDataClient({ fetcher: async () => new Response('{}') });
  await assert.rejects(invalid.load('calendar', 'current/races/', validateCalendar), /unavailable/);
});
void test('empty preseason standings are valid and another season is rejected', () => {
  assert.equal(
    validateStandings(
      { MRData: { StandingsTable: { season: '2026', StandingsLists: [] } } },
      '2026',
      'DriverStandings',
    ),
    null,
  );
  assert.throws(() =>
    validateStandings(
      { MRData: { StandingsTable: { season: '2025', StandingsLists: [] } } },
      '2026',
      'DriverStandings',
    ),
  );
});
void test('calendar and standings caches are isolated across season rollover', async () => {
  const storage = store();
  const oldClient = createDataClient({
    storage,
    fetcher: async () => new Response(JSON.stringify(calendar)),
  });
  await oldClient.load('calendar:2026', 'current/races/', validateCalendar);
  const newClient = createDataClient({
    storage,
    fetcher: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(
    newClient.load('calendar:2027', 'current/races/', validateCalendar),
    /offline/,
  );
});
