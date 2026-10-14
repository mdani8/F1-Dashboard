import type { Race } from '../contracts/providers.js';
import type { ScheduledSession, SessionDate, SessionSlug } from '../contracts/results.js';
const SESSION_FIELDS = [
  ['FirstPractice', 'Practice 1'],
  ['SecondPractice', 'Practice 2'],
  ['ThirdPractice', 'Practice 3'],
  ['Qualifying', 'Qualifying'],
  ['SprintQualifying', 'Sprint qualifying'],
  ['SprintShootout', 'Sprint qualifying'],
  ['Sprint', 'Sprint'],
] as const;
export function timestamp(session: SessionDate | null | undefined): number | null {
  if (!session?.date || !session.time) return null;
  const value = Date.parse(session.date + 'T' + session.time);
  return Number.isFinite(value) ? value : null;
}
type RaceSchedule = SessionDate & Partial<Pick<Race, (typeof SESSION_FIELDS)[number][0]>>;
export function sessions(race: RaceSchedule): ScheduledSession[] {
  const list: (SessionDate & { name: string })[] = [];
  for (const [key, name] of SESSION_FIELDS) {
    const date = race[key];
    if (!date || (key === 'SprintShootout' && race.SprintQualifying)) continue;
    list.push({ name, ...date });
  }
  list.push({ name: 'Race', date: race.date, time: race.time });
  return list
    .map((session) => ({
      ...session,
      slug: session.name.toLowerCase().replaceAll(' ', '-') as SessionSlug,
    }))
    .sort((a, b) => (timestamp(a) ?? endOfDate(a)) - (timestamp(b) ?? endOfDate(b)));
}
function endOfDate(session: SessionDate): number {
  return Date.parse(session.date + 'T23:59:59Z');
}
export function isUpcoming(race: SessionDate, now = Date.now()): boolean {
  // A date-only race remains upcoming throughout its announced UTC date.
  return (timestamp(race) ?? endOfDate(race)) >= now;
}
export function nextRace<T extends SessionDate & { round: string }>(
  races: T[],
  now = Date.now(),
): T | null {
  return (
    [...races]
      .sort((a, b) => Number(a.round) - Number(b.round))
      .find((race) => isUpcoming(race, now)) || null
  );
}
export function nextSession(race: RaceSchedule, now = Date.now()): ScheduledSession | null {
  return sessions(race).find((session) => isUpcoming(session, now)) || null;
}
export function displayDate(
  session: SessionDate,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  const time = timestamp(session);
  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: time === null ? 'UTC' : timezone,
  }).format(time ?? Date.parse(session.date + 'T12:00:00Z'));
}
export function displaySession(session: SessionDate, timezone: string): string {
  const date = displayDate(session, timezone, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = timestamp(session);
  return (
    date +
    ' · ' +
    (time === null
      ? 'Time TBC'
      : new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(time))
  );
}
