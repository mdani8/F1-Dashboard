export const TTL = 15 * 60 * 1000;
export const API = '/api/jolpica/';
const SESSION_FIELDS = [['FirstPractice','Practice 1'],['SecondPractice','Practice 2'],['ThirdPractice','Practice 3'],['Qualifying','Qualifying'],['SprintQualifying','Sprint qualifying'],['SprintShootout','Sprint qualifying'],['Sprint','Sprint']];

export function timestamp(session) {
  if (!session?.date || !session.time) return null;
  const value = Date.parse(`${session.date}T${session.time}`);
  return Number.isFinite(value) ? value : null;
}
export function sessions(race) {
  const list = SESSION_FIELDS.filter(([key]) => race[key]).map(([key, name]) => ({ name, ...race[key] }));
  if (race.SprintQualifying && race.SprintShootout) list.splice(list.findIndex(s => s.name === 'Sprint qualifying') + 1, 1);
  list.push({ name: 'Race', date: race.date, time: race.time });
  return list.map(session => ({ ...session, slug:session.name.toLowerCase().replaceAll(' ', '-') })).sort((a,b) => (timestamp(a) ?? Date.parse(a.date + 'T23:59:59Z')) - (timestamp(b) ?? Date.parse(b.date + 'T23:59:59Z')));
}
export function isUpcoming(race, now = Date.now()) {
  const time = timestamp(race);
  // With no start time, retain the race through its announced UTC date.
  return (time ?? Date.parse(race.date + 'T23:59:59Z')) >= now;
}
export function nextRace(races, now = Date.now()) {
  return [...races].sort((a,b) => Number(a.round) - Number(b.round)).find(r => isUpcoming(r, now)) || null;
}
export function nextSession(race, now = Date.now()) {
  return sessions(race).find(s => (timestamp(s) ?? Date.parse(s.date + 'T23:59:59Z')) >= now) || null;
}
export function displayDate(session, timezone, options = { month:'short', day:'numeric' }) {
  // Date-only values describe the announced date, not midnight in the viewer's timezone.
  const time = timestamp(session);
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: time === null ? 'UTC' : timezone }).format(time ?? Date.parse(session.date + 'T12:00:00Z'));
}
export function displaySession(session, timezone) {
  const date = displayDate(session, timezone, { weekday:'short', month:'short', day:'numeric' });
  const time = timestamp(session);
  return `${date} · ${time === null ? 'Time TBC' : new Intl.DateTimeFormat('en-GB', { timeZone:timezone, hour:'2-digit', minute:'2-digit', hour12:false }).format(time)}`;
}

export function createDataClient({ storage, fetcher = fetch, now = Date.now } = {}) {
  function read(key) {
    try { const value = JSON.parse(storage?.getItem('gridline:v1:' + key) || 'null'); return value && Number.isFinite(value.at) && value.data ? value : null; } catch { return null; }
  }
  async function load(key, route, validate, force = false) {
    const cached = read(key);
    if (!force && cached && now() - cached.at >= 0 && now() - cached.at < TTL) {
      try { validate(cached.data); return { ...cached, stale:false }; } catch { /* Ignore invalid cache. */ }
    }
    try {
      const response = await fetcher(API + route + '?format=json&limit=100' + (force ? '&refresh=1' : ''), { signal:AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(response.status === 429 ? 'The data provider is busy. Please try again shortly.' : 'Unable to reach the data provider.');
      const data = await response.json();
      validate(data);
      const providerAt = Number(response.headers?.get('X-Data-At'));
      const result = { data, at:providerAt > 0 ? providerAt : now(), stale:response.headers?.get('X-Data-Stale') === 'true' };
      if (!result.stale) try { storage?.setItem('gridline:v1:' + key, JSON.stringify({ data, at:result.at })); } catch { /* Storage may be blocked or full. */ }
      return result;
    } catch (error) {
      if (cached) {
        try { validate(cached.data); return { ...cached, stale:true, error:error.message }; } catch { /* Invalid fallback is not displayable. */ }
      }
      throw error;
    }
  }
  return { load };
}

export function validateCalendar(data) {
  const table = data?.MRData?.RaceTable;
  if (!/^\d{4}$/.test(table?.season) || !Array.isArray(table.Races) || table.Races.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.Circuit || !r.raceName)) throw new Error('The calendar data is unavailable.');
  return table;
}
export function validateStandings(data, season, kind) {
  const table = data?.MRData?.StandingsTable;
  if (table?.season !== String(season) || !Array.isArray(table.StandingsLists) || table.StandingsLists.some(s => s.season !== String(season) || !Array.isArray(s[kind]))) throw new Error('The championship data is unavailable.');
  return table.StandingsLists[0] || null;
}
