import { isRecord } from './guards.js';
import type {
  CalendarPayload,
  CalendarTable,
  Race,
  StandingsList,
  StandingsPayload,
} from './providers.js';
function isRace(value: unknown): value is Race {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    isRecord(value.Circuit) &&
    typeof value.raceName === 'string'
  );
}
export function isCalendarPayload(value: unknown): value is CalendarPayload {
  if (!isRecord(value) || !isRecord(value.MRData) || !isRecord(value.MRData.RaceTable))
    return false;
  const table = value.MRData.RaceTable;
  return (
    typeof table.season === 'string' &&
    /^\d{4}$/.test(table.season) &&
    Array.isArray(table.Races) &&
    table.Races.every(isRace)
  );
}
export function validateCalendar(value: unknown): CalendarTable {
  if (!isCalendarPayload(value)) throw new Error('The calendar data is unavailable.');
  return value.MRData.RaceTable;
}
function isStandingsPayload(value: unknown): value is StandingsPayload {
  return (
    isRecord(value) &&
    isRecord(value.MRData) &&
    isRecord(value.MRData.StandingsTable) &&
    typeof value.MRData.StandingsTable.season === 'string' &&
    Array.isArray(value.MRData.StandingsTable.StandingsLists)
  );
}
export function validateStandings(
  value: unknown,
  season: string | number,
  kind: 'DriverStandings' | 'ConstructorStandings',
): StandingsList | null {
  if (
    !isStandingsPayload(value) ||
    value.MRData.StandingsTable.season !== String(season) ||
    value.MRData.StandingsTable.StandingsLists.some(
      (list) => list.season !== String(season) || !Array.isArray(list[kind]),
    )
  )
    throw new Error('The championship data is unavailable.');
  return value.MRData.StandingsTable.StandingsLists[0] || null;
}
