import { isRecord } from '../../shared/contracts/guards.js';
import { isCalendarPayload } from '../../shared/contracts/jolpica.js';
import type { CalendarPayload, OpenSession, OpenTiming } from '../../shared/contracts/providers.js';
export function validArray(data: unknown): asserts data is Record<string, unknown>[] {
  if (!Array.isArray(data) || !data.every(isRecord)) throw new Error('Invalid provider response.');
}
export function validTiming(data: unknown): asserts data is OpenTiming[] {
  validArray(data);
  if (data.some((row) => !Number.isInteger(row.driver_number) || Number(row.driver_number) < 1))
    throw new Error('Invalid driver timing response.');
}
export function validSessions(data: unknown): asserts data is OpenSession[] {
  validArray(data);
  if (
    data.some(
      (row) =>
        !Number.isInteger(row.session_key) ||
        !Number.isInteger(row.meeting_key) ||
        typeof row.date_start !== 'string' ||
        !Number.isFinite(Date.parse(row.date_start)),
    )
  )
    throw new Error('Invalid session response.');
}
export function validRaces(
  season: string | number,
): (data: unknown) => asserts data is CalendarPayload {
  return (data: unknown): asserts data is CalendarPayload => {
    if (!isCalendarPayload(data) || String(data.MRData.RaceTable.season) !== String(season))
      throw new Error('Invalid season response.');
  };
}
