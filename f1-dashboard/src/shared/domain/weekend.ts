import type { Route, ScheduledSession, SessionDate, Weekend } from '../contracts/results.js';
const SESSION_SLUGS: readonly string[] = [
  'practice-1',
  'practice-2',
  'practice-3',
  'qualifying',
  'sprint-qualifying',
  'sprint',
  'race',
];
export const REFRESH_INTERVAL = 60000;

export function weekendHref(
  season: string | number,
  round: string | number,
  session: string | null = null,
  driver: number | null = null,
) {
  const params = new URLSearchParams();
  if (session) params.set('session', session);
  if (driver !== null) params.set('driver', String(driver));
  const query = params.toString();
  return `#/weekend/${season}/${round}${query ? '?' + query : ''}`;
}

export function parseWeekendRoute(hash: string): Route {
  if (!hash.startsWith('#/weekend')) return null;
  const match = /^#\/weekend\/(20\d{2})\/([1-9]\d?)(?:\?([^#]*))?$/.exec(hash);
  if (!match) return { invalid: true };
  const params = new URLSearchParams(match[3] || '');
  const session = params.get('session');
  const driver = params.get('driver');
  if (
    (session && !SESSION_SLUGS.includes(session)) ||
    (driver !== null && !/^[1-9]\d{0,2}$/.test(driver))
  )
    return { invalid: true };
  return {
    season: match[1]!,
    round: match[2]!,
    session,
    driver: driver === null ? null : Number(driver),
  };
}

export function defaultSession(list: ScheduledSession[], now = Date.now()) {
  const started = list.filter((session) => (session.start ?? Date.parse(session.date)) <= now);
  return (started.at(-1) || list[0])?.slug ?? null;
}

export function pollingWindow(race: SessionDate, list: ScheduledSession[]) {
  return {
    pollFrom: Math.min(...list.map((session) => session.start ?? Date.parse(session.date))),
    pollUntil: Date.parse(race.date + 'T00:00:00Z') + 2 * 86400000,
  };
}

export function shouldPoll(
  weekend: Pick<Weekend, 'pollFrom' | 'pollUntil'> | null,
  { now = Date.now(), visible = true, active = true } = {},
) {
  return Boolean(
    weekend && visible && active && now >= weekend.pollFrom && now < weekend.pollUntil,
  );
}

export function resultTTL(weekend: Weekend, now = Date.now()) {
  return shouldPoll(weekend, { now }) ? REFRESH_INTERVAL : 15 * REFRESH_INTERVAL;
}

export function formatDuration(seconds: unknown) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '—';
  const millis = Math.round(Number(seconds) * 1000);
  const minutes = Math.floor(millis / 60000);
  return `${minutes ? minutes + ':' : ''}${((millis % 60000) / 1000).toFixed(3).padStart(minutes ? 6 : 1, '0')}`;
}
