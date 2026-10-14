import type { SessionDate } from '../contracts/results.js';
import { timestamp } from './calendar.js';
export const sessionStart = (session: SessionDate & { start?: number | null }): number | null =>
  typeof session.start === 'number' && Number.isFinite(session.start)
    ? session.start
    : timestamp(session);
export function countdown<
  T extends SessionDate & { name: string; start?: number | null; cancelled?: boolean },
>(sessions: T[], now: number) {
  const upcoming = sessions
    .filter(
      (session) =>
        !session.cancelled &&
        (sessionStart(session) ?? Date.parse(session.date + 'T23:59:59Z')) >= now,
    )
    .sort(
      (a, b) =>
        (sessionStart(a) ?? Date.parse(a.date + 'T23:59:59Z')) -
        (sessionStart(b) ?? Date.parse(b.date + 'T23:59:59Z')),
    )[0];
  if (!upcoming) return null;
  const start = sessionStart(upcoming);
  if (start === null) return { session: upcoming, text: 'Time TBC', seconds: null };
  const seconds = Math.max(0, Math.ceil((start - now) / 1000));
  const days = Math.floor(seconds / 86400),
    hours = Math.floor((seconds % 86400) / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    remainder = seconds % 60;
  const parts = [
    days ? `${days}d` : '',
    days || hours ? `${hours}h` : '',
    `${String(minutes).padStart(2, '0')}m`,
    `${String(remainder).padStart(2, '0')}s`,
  ].filter(Boolean);
  return { session: upcoming, text: seconds ? parts.join(' ') : 'Starting now', seconds };
}
