import { isRecord } from './guards.js';
import type { LapBundle, SessionBundle, Weekend } from './results.js';
export function validateWeekend(value: unknown): asserts value is Weekend {
  if (
    !isRecord(value) ||
    !/^20\d{2}$/.test(String(value.season)) ||
    !Array.isArray(value.sessions) ||
    !value.name ||
    !Number.isFinite(value.pollFrom) ||
    !Number.isFinite(value.pollUntil)
  )
    throw new Error('The weekend response is unavailable.');
}
export function validateSession(value: unknown): asserts value is SessionBundle {
  if (
    !isRecord(value) ||
    !isRecord(value.session) ||
    !value.session.slug ||
    !['results', 'pits', 'tires', 'drivers'].every(
      (key) => isRecord(value[key]) && Array.isArray(value[key].data),
    )
  )
    throw new Error('The session response is unavailable.');
}
export function validateLaps(value: unknown): asserts value is LapBundle {
  if (
    !isRecord(value) ||
    !isRecord(value.session) ||
    !value.session.slug ||
    !isRecord(value.laps) ||
    !Array.isArray(value.laps.data)
  )
    throw new Error('The lap response is unavailable.');
}
