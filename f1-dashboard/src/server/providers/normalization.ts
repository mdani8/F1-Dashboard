import { nullableNumber } from '../../shared/contracts/guards.js';
import type {
  JolpicaDriver,
  JolpicaResult,
  OpenSession,
  OpenTiming,
  Race,
} from '../../shared/contracts/providers.js';
import type { Driver, Lap, PitStop, Result, TireStint } from '../../shared/contracts/results.js';
import { timestamp } from '../../shared/domain/calendar.js';
import { countryKey, nameKey } from '../../shared/domain/identity.js';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
export const openSlug = (name: string) =>
  name === 'Sprint Shootout'
    ? 'sprint-qualifying'
    : String(name || '')
        .toLowerCase()
        .replaceAll(' ', '-');

export function matchMeeting(race: Race, season: string | number, entries: OpenSession[]) {
  const start = timestamp(race) ?? Date.parse(race.date + 'T12:00:00Z');
  const location = nameKey(race.Circuit?.Location?.locality);
  const circuit = nameKey(race.Circuit?.circuitName).replace(
    /grandprix|international|circuit/g,
    '',
  );
  const candidates = entries.filter((item) => {
    const remoteCircuit = nameKey(item.circuit_short_name).replace(
      /grandprix|international|circuit/g,
      '',
    );
    const samePlace =
      (location && location === nameKey(item.location)) ||
      (circuit &&
        remoteCircuit &&
        (circuit.includes(remoteCircuit) || remoteCircuit.includes(circuit)));
    return (
      item.session_name === 'Race' &&
      String(item.year) === String(season) &&
      Number.isInteger(item.meeting_key) &&
      Math.abs(Date.parse(item.date_start) - start) <= 36 * 3600000 &&
      countryKey(item.country_name) === countryKey(race.Circuit?.Location?.country) &&
      samePlace
    );
  });
  return candidates.length === 1 ? candidates[0]!.meeting_key : null;
}

export function matchDriver(driver: JolpicaDriver, roster: OpenTiming[]) {
  const code = nameKey(driver.code);
  const full = nameKey(`${driver.givenName || ''} ${driver.familyName || ''}`);
  const byCode = code ? roster.filter((row) => nameKey(row.name_acronym) === code) : [];
  const matches = byCode.length
    ? byCode
    : roster.filter(
        (row) =>
          nameKey(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`) === full &&
          full,
      );
  // permanentNumber can differ from the reigning champion's actual session number.
  return matches.length === 1 && Number.isInteger(matches[0]!.driver_number) ? matches[0] : null;
}

export function rosterDriver(row: OpenTiming): Driver {
  return {
    number: nullableNumber(row.driver_number),
    name:
      row.full_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      `Driver ${row.driver_number}`,
    code: row.name_acronym || null,
    team: row.team_name || null,
    color: /^[a-f\d]{6}$/i.test(row.team_colour || '') ? '#' + row.team_colour : null,
  };
}

export function normalizeJolpica(
  rows: JolpicaResult[],
  roster: OpenTiming[],
  slug: string,
): Result[] {
  return rows
    .map((row) => {
      const matched = matchDriver(row.Driver || {}, roster);
      return {
        driver: matched
          ? rosterDriver(matched)
          : {
              number: null,
              name:
                [row.Driver?.givenName, row.Driver?.familyName].filter(Boolean).join(' ') ||
                'Unknown driver',
              code: row.Driver?.code || null,
              team: row.Constructor?.name || null,
              color: null,
            },
        position: nullableNumber(row.position),
        positionLabel:
          text(row.positionText) ||
          (nullableNumber(row.position) === null ? '—' : String(row.position)),
        grid: nullableNumber(row.grid),
        laps: nullableNumber(row.laps),
        points: nullableNumber(row.points),
        time: text(row.Time?.time),
        gap:
          text(row.Time?.time) ||
          (/^\+\d+\s+Laps?$/i.test(row.status || '') ? row.status || null : null),
        status: text(row.status),
        qTimes: slug === 'qualifying' ? [text(row.Q1), text(row.Q2), text(row.Q3)] : null,
        bestLap: null,
      };
    })
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}

export function normalizeOpenResults(
  rows: OpenTiming[],
  roster: OpenTiming[],
  slug: string,
): Result[] {
  return rows
    .map((row) => ({
      driver: rosterDriver(
        roster.find((driver) => driver.driver_number === row.driver_number) || {
          driver_number: row.driver_number,
        },
      ),
      position: nullableNumber(row.position),
      positionLabel:
        row.position === null || row.position === undefined ? '—' : String(row.position),
      grid: null,
      laps: nullableNumber(row.number_of_laps),
      points: null,
      time: null,
      gap: Array.isArray(row.gap_to_leader) ? null : (row.gap_to_leader ?? null),
      bestLap: Array.isArray(row.duration) ? null : nullableNumber(row.duration),
      qTimes:
        slug === 'sprint-qualifying'
          ? Array.isArray(row.duration)
            ? [0, 1, 2].map((index) =>
                nullableNumber(Array.isArray(row.duration) ? row.duration[index] : null),
              )
            : [nullableNumber(row.duration), null, null]
          : null,
      status: row.dsq ? 'Disqualified' : row.dns ? 'Did not start' : row.dnf ? 'Retired' : null,
    }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}

export function normalizePits(rows: OpenTiming[], roster: OpenTiming[]): PitStop[] {
  return rows
    .map((row) => ({
      driver: rosterDriver(
        roster.find((driver) => driver.driver_number === row.driver_number) || {
          driver_number: row.driver_number,
        },
      ),
      lap: nullableNumber(row.lap_number),
      date: text(row.date),
      stopDuration: nullableNumber(row.stop_duration),
      laneDuration: nullableNumber(row.lane_duration ?? row.pit_duration),
    }))
    .sort((a, b) => (a.lap ?? Infinity) - (b.lap ?? Infinity));
}

export function normalizeStints(rows: OpenTiming[], roster: OpenTiming[]): TireStint[] {
  return rows
    .map((row) => ({
      driver: rosterDriver(
        roster.find((driver) => driver.driver_number === row.driver_number) || {
          driver_number: row.driver_number,
        },
      ),
      stint: nullableNumber(row.stint_number),
      compound: text(row.compound),
      lapStart: nullableNumber(row.lap_start),
      lapEnd: nullableNumber(row.lap_end),
      tyreAge: nullableNumber(row.tyre_age_at_start),
    }))
    .sort(
      (a, b) =>
        (a.driver.number ?? Infinity) - (b.driver.number ?? Infinity) ||
        (a.stint ?? Infinity) - (b.stint ?? Infinity),
    );
}

export function normalizeLaps(
  rows: OpenTiming[],
  stints: OpenTiming[] = [],
  pits: OpenTiming[] = [],
): Lap[] {
  return rows
    .map((row) => {
      const matches = stints.filter(
        (stint) =>
          stint.driver_number === row.driver_number &&
          nullableNumber(stint.lap_start) !== null &&
          nullableNumber(stint.lap_end) !== null &&
          row.lap_number != null &&
          stint.lap_start != null &&
          stint.lap_end != null &&
          row.lap_number >= stint.lap_start &&
          row.lap_number <= stint.lap_end,
      );
      return {
        lap: nullableNumber(row.lap_number),
        duration: nullableNumber(row.lap_duration),
        sectors: [
          nullableNumber(row.duration_sector_1),
          nullableNumber(row.duration_sector_2),
          nullableNumber(row.duration_sector_3),
        ],
        compound: matches.length === 1 ? text(matches[0]!.compound) : null,
        outLap: typeof row.is_pit_out_lap === 'boolean' ? row.is_pit_out_lap : null,
        pitLap: pits.some(
          (pit) => pit.driver_number === row.driver_number && pit.lap_number === row.lap_number,
        ),
      };
    })
    .sort((a, b) => (a.lap ?? Infinity) - (b.lap ?? Infinity));
}
