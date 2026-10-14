import { scalarText } from '../contracts/guards.js';
import type { ScheduledSession } from '../contracts/results.js';

import type { Weekend } from '../contracts/results.js';

import { sessionStart } from './countdown.js';
const escapeCalendar = (value: unknown) =>
  scalarText(value || '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
const calendarTime = (value: number) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let result = '',
    current = '',
    bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      result += current + '\r\n';
      current = ' ';
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  return result + current;
}
export function weekendCalendar(
  weekend: Pick<Weekend, 'name' | 'season' | 'round'> &
    Partial<Pick<Weekend, 'circuit' | 'location' | 'country'>> & {
      sessions: (Omit<ScheduledSession, 'slug'> & { slug: string })[];
    },
  { now = Date.now(), origin = 'http://127.0.0.1:5173' } = {},
) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gridline//Formula 1 Weekend//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeCalendar(weekend.name + ' ' + weekend.season)}`,
  ];
  for (const session of weekend.sessions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date || '')) continue;
    const start = sessionStart(session);
    lines.push(
      'BEGIN:VEVENT',
      `UID:gridline-${weekend.season}-${weekend.round}-${session.slug}@gridline.local`,
      `DTSTAMP:${calendarTime(now)}`,
    );
    if (start !== null) {
      lines.push(`DTSTART:${calendarTime(start)}`);
      if (typeof session.end === 'number' && Number.isFinite(session.end) && session.end > start)
        lines.push(`DTEND:${calendarTime(session.end)}`);
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${session.date.replaceAll('-', '')}`,
        `DTEND;VALUE=DATE:${new Date(Date.parse(session.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replaceAll('-', '')}`,
      );
    }
    lines.push(
      `SUMMARY:${escapeCalendar(weekend.name + ' — ' + session.name)}`,
      `LOCATION:${escapeCalendar([weekend.circuit, weekend.location, weekend.country].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${escapeCalendar(`Gridline · Published Formula 1 schedule.${start === null ? ' Start time to be confirmed.' : ''}`)}`,
      `URL:${origin}/#/weekend/${weekend.season}/${weekend.round}?session=${session.slug}`,
      `STATUS:${session.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
