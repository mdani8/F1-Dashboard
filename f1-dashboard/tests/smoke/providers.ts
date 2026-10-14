interface LiveRecord {
  season: string;
  round: string;
  weekend: string;
  session: string;
  sessionKey: number | null | undefined;
  results: { status: string; rows: number; source: string };
  pits: { status: string; rows: number };
  tires: { status: string; rows: number };
  unmatchedDrivers: number;
  laps?: { driver: number; status: string; rows: number };
}
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createResultsService } from '../../src/server/features/results/results-service.js';
import { artifactPath } from '../support/paths.js';

const service = createResultsService();
const report: LiveRecord[] = [];
for (const [round, slug] of [
  ['1', 'race'],
  ['1', 'practice-1'],
  ['1', 'qualifying'],
  ['2', 'practice-1'],
  ['2', 'sprint-qualifying'],
  ['2', 'sprint'],
] as const) {
  const bundle = await service.getSession('2026', round, slug);
  const record: LiveRecord = {
    season: '2026',
    round,
    weekend: bundle.weekend.name,
    session: slug,
    sessionKey: bundle.session.sessionKey,
    results: {
      status: bundle.results.status,
      rows: bundle.results.data.length,
      source: bundle.results.source,
    },
    pits: { status: bundle.pits.status, rows: bundle.pits.data.length },
    tires: { status: bundle.tires.status, rows: bundle.tires.data.length },
    unmatchedDrivers: bundle.results.data.filter((row) => row.driver.number === null).length,
  };
  if (round === '1' && slug === 'race') {
    const driver = bundle.results.data.find((row) => row.driver.number !== null)?.driver.number;
    if (driver) {
      const detail = await service.getLaps('2026', round, slug, driver);
      record.laps = { driver, status: detail.laps.status, rows: detail.laps.data.length };
    }
  }
  report.push(record);
  console.log(JSON.stringify(record));
}
await writeFile(
  artifactPath('live-verification.json'),
  JSON.stringify({ checkedAt: new Date().toISOString(), sessions: report }, null, 2),
);
assert.ok(
  report.every((row) => row.sessionKey !== null),
  'Both completed weekends map to OpenF1',
);
assert.ok(
  report.every((row) => row.results.status === 'available' && row.results.rows > 0),
  'Published classifications are available for each selected session',
);
assert.ok(
  report.every((row) => row.pits.status === 'available' && row.tires.status === 'available'),
  'Detailed published pit and tire data are available',
);
assert.ok(
  report[0]!.laps?.status === 'available' && report[0]!.laps.rows > 0,
  'Selected driver lap timing is available',
);
