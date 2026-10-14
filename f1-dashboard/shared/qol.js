import { timestamp } from './data.js';

const nameKey = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const FAVOURITES_KEY = 'gridline:favourites:v1';
export function driverKey(driver) {
  const code = driver?.code || driver?.name_acronym;
  if (code) return 'code:' + String(code).toUpperCase();
  const name = driver?.name || driver?.full_name || [driver?.givenName,driver?.familyName].filter(Boolean).join(' ');
  return name ? 'name:' + nameKey(name) : null;
}
export function teamKey(team) {
  const key = nameKey(typeof team === 'string' ? team : team?.constructorId || team?.name || team?.team_name);
  if (!key) return null;
  if (key === 'rb' || key.includes('racingbulls') || key.includes('alphatauri')) return 'racingbulls';
  if (key.includes('redbull')) return 'redbull';
  for (const identity of ['mercedes','mclaren','ferrari','astonmartin','alpine','williams','haas','audi','sauber','cadillac']) if (key.includes(identity)) return identity;
  return key;
}
export function sanitizeFavourites(value) {
  const drivers = Array.isArray(value?.drivers) ? value.drivers.filter(key => typeof key === 'string' && /^(code:[A-Z0-9]{1,8}|name:[a-z0-9]{1,100})$/.test(key)) : [];
  const teams = Array.isArray(value?.teams) ? value.teams.filter(key => typeof key === 'string' && /^[a-z0-9]{1,100}$/.test(key)) : [];
  return {drivers:[...new Set(drivers)].slice(0,200),teams:[...new Set(teams)].slice(0,100)};
}

export const sessionStart = session => Number.isFinite(session?.start) ? session.start : timestamp(session);
export function countdown(sessions,now) {
  const upcoming = sessions.filter(session => !session.cancelled && (sessionStart(session) ?? Date.parse(session.date + 'T23:59:59Z')) >= now)
    .sort((a,b) => (sessionStart(a) ?? Date.parse(a.date + 'T23:59:59Z')) - (sessionStart(b) ?? Date.parse(b.date + 'T23:59:59Z')))[0];
  if (!upcoming) return null;
  const start = sessionStart(upcoming);
  if (start === null) return {session:upcoming,text:'Time TBC',seconds:null};
  const seconds = Math.max(0,Math.ceil((start - now) / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
  const parts = [days ? `${days}d` : '',days || hours ? `${hours}h` : '',`${String(minutes).padStart(2,'0')}m`,`${String(remainder).padStart(2,'0')}s`].filter(Boolean);
  return {session:upcoming,text:seconds ? parts.join(' ') : 'Starting now',seconds};
}

const escapeCalendar = value => String(value || '').replaceAll('\\','\\\\').replace(/\r\n|\n|\r/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const calendarTime = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function foldCalendarLine(line) {
  const encoder = new TextEncoder();
  let result = '', current = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {result += current + '\r\n';current = ' ';bytes = 1;}
    current += character;bytes += size;
  }
  return result + current;
}
export function weekendCalendar(weekend,{now = Date.now(),origin = 'http://127.0.0.1:5173'} = {}) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gridline//Formula 1 Weekend//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escapeCalendar(weekend.name + ' ' + weekend.season)}`];
  for (const session of weekend.sessions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date || '')) continue;
    const start = sessionStart(session);
    lines.push('BEGIN:VEVENT',`UID:gridline-${weekend.season}-${weekend.round}-${session.slug}@gridline.local`,`DTSTAMP:${calendarTime(now)}`);
    if (start !== null) {
      lines.push(`DTSTART:${calendarTime(start)}`);
      if (Number.isFinite(session.end) && session.end > start) lines.push(`DTEND:${calendarTime(session.end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${session.date.replaceAll('-','')}`,`DTEND;VALUE=DATE:${new Date(Date.parse(session.date + 'T00:00:00Z') + 86400000).toISOString().slice(0,10).replaceAll('-','')}`);
    }
    lines.push(`SUMMARY:${escapeCalendar(weekend.name + ' — ' + session.name)}`,`LOCATION:${escapeCalendar([weekend.circuit,weekend.location,weekend.country].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${escapeCalendar(`Gridline · Published Formula 1 schedule.${start === null ? ' Start time to be confirmed.' : ''}`)}`,
      `URL:${origin}/#/weekend/${weekend.season}/${weekend.round}?session=${session.slug}`,`STATUS:${session.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}

export function filteredLaps(laps,filter,annotationsKnown = true) {
  if (filter === 'clean') return annotationsKnown ? laps.filter(lap => lap.outLap === false && lap.pitLap === false && Number.isFinite(lap.duration) && lap.duration > 0) : [];
  if (filter === 'pit') return laps.filter(lap => lap.pitLap === true);
  if (filter === 'out') return laps.filter(lap => lap.outLap === true);
  return laps;
}
export function fastestLaps(laps,annotationsKnown = true) {
  const clean = filteredLaps(laps,'clean',annotationsKnown);
  if (!clean.length) return {numbers:new Set(),duration:null};
  const duration = Math.min(...clean.map(lap => lap.duration));
  return {numbers:new Set(clean.filter(lap => Math.round(lap.duration * 1000) === Math.round(duration * 1000)).map(lap => lap.lap)),duration};
}
