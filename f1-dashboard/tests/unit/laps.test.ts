import assert from 'node:assert/strict';
import test from 'node:test';
import { fastestLaps, filteredLaps } from '../../src/shared/domain/laps.js';

void test('lap filters retain unknown records and fastest markers exclude pit/out laps', () => {
  const laps = [
    { lap: 1, duration: 60, outLap: true, pitLap: false },
    { lap: 2, duration: 61, outLap: false, pitLap: true },
    { lap: 3, duration: 80.123, outLap: false, pitLap: false },
    { lap: 4, duration: 80.123, outLap: false, pitLap: false },
    { lap: 5, duration: null, outLap: false, pitLap: false },
    { lap: 6, duration: 79, outLap: null, pitLap: false },
  ];
  assert.equal(filteredLaps(laps, 'all').length, 6);
  assert.deepEqual(
    filteredLaps(laps, 'clean').map((row) => row.lap),
    [3, 4],
  );
  assert.deepEqual(
    filteredLaps(laps, 'pit').map((row) => row.lap),
    [2],
  );
  assert.deepEqual(
    filteredLaps(laps, 'out').map((row) => row.lap),
    [1],
  );
  assert.deepEqual([...fastestLaps(laps).numbers], [3, 4]);
  assert.equal(fastestLaps(laps).duration, 80.123);
  assert.equal(fastestLaps(laps, false).duration, null);
  assert.deepEqual(filteredLaps(laps, 'clean', false), []);
});
