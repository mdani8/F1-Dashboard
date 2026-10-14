import { sessions, timestamp } from './shared/data.js';
import { pollingWindow, resultTTL } from './shared/weekend-model.js';
import { createUpstream, ProviderError } from './upstream.mjs';
import { createTrackService } from './track-service.mjs';

const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => typeof value === 'string' && value.trim() ? value : null;
const nameKey = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const countryKey = value => ({usa:'unitedstates',uk:'unitedkingdom',uae:'unitedarabemirates'}[nameKey(value)] || nameKey(value)).replace(/^the/, '');
const validArray = data => { if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid provider response.'); };
const validTiming = data => {validArray(data);if (data.some(row => !Number.isInteger(row.driver_number) || row.driver_number < 1)) throw new Error('Invalid driver timing response.');};
const validSessions = data => {validArray(data);if (data.some(row => !Number.isInteger(row.session_key) || !Number.isInteger(row.meeting_key) || !Number.isFinite(Date.parse(row.date_start)))) throw new Error('Invalid session response.');};
const validRaces = season => data => {
  const table = data?.MRData?.RaceTable;
  if (String(table?.season) !== String(season) || !Array.isArray(table.Races)) throw new Error('Invalid season response.');
};
const openSlug = name => name === 'Sprint Shootout' ? 'sprint-qualifying' : String(name || '').toLowerCase().replaceAll(' ', '-');

export function matchMeeting(race, season, entries) {
  const start = timestamp(race) ?? Date.parse(race.date + 'T12:00:00Z');
  const location = nameKey(race.Circuit?.Location?.locality);
  const circuit = nameKey(race.Circuit?.circuitName).replace(/grandprix|international|circuit/g, '');
  const candidates = entries.filter(item => {
    const remoteCircuit = nameKey(item.circuit_short_name).replace(/grandprix|international|circuit/g, '');
    const samePlace = location && location === nameKey(item.location) || circuit && remoteCircuit && (circuit.includes(remoteCircuit) || remoteCircuit.includes(circuit));
    return item.session_name === 'Race' && String(item.year) === String(season) && Number.isInteger(item.meeting_key) && Math.abs(Date.parse(item.date_start) - start) <= 36 * 3600000 && countryKey(item.country_name) === countryKey(race.Circuit?.Location?.country) && samePlace;
  });
  return candidates.length === 1 ? candidates[0].meeting_key : null;
}

export function matchDriver(driver, roster) {
  const code = nameKey(driver.code);
  const full = nameKey(`${driver.givenName || ''} ${driver.familyName || ''}`);
  const byCode = code ? roster.filter(row => nameKey(row.name_acronym) === code) : [];
  const matches = byCode.length ? byCode : roster.filter(row => nameKey(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`) === full && full);
  // permanentNumber can differ from the reigning champion's actual session number.
  return matches.length === 1 && Number.isInteger(matches[0].driver_number) ? matches[0] : null;
}

function rosterDriver(row) {
  return { number:number(row.driver_number), name:row.full_name || [row.first_name,row.last_name].filter(Boolean).join(' ') || `Driver ${row.driver_number}`, code:row.name_acronym || null, team:row.team_name || null, color:/^[a-f\d]{6}$/i.test(row.team_colour) ? '#' + row.team_colour : null };
}

export function normalizeJolpica(rows, roster, slug) {
  return rows.map(row => {
    const matched = matchDriver(row.Driver || {}, roster);
    return {
      driver:matched ? rosterDriver(matched) : {number:null,name:[row.Driver?.givenName,row.Driver?.familyName].filter(Boolean).join(' ') || 'Unknown driver',code:row.Driver?.code || null,team:row.Constructor?.name || null,color:null},
      position:number(row.position), positionLabel:text(row.positionText) || (number(row.position) === null ? '—' : String(row.position)),
      grid:number(row.grid), laps:number(row.laps), points:number(row.points),
      time:text(row.Time?.time), gap:text(row.Time?.time) || (/^\+\d+\s+Laps?$/i.test(row.status || '') ? row.status : null),
      status:text(row.status), qTimes:slug === 'qualifying' ? [text(row.Q1),text(row.Q2),text(row.Q3)] : null,
      bestLap:null
    };
  }).sort((a,b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}

export function normalizeOpenResults(rows, roster, slug) {
  return rows.map(row => ({
    driver:rosterDriver(roster.find(driver => driver.driver_number === row.driver_number) || {driver_number:row.driver_number}),
    position:number(row.position), positionLabel:row.position === null || row.position === undefined ? '—' : String(row.position),
    grid:null, laps:number(row.number_of_laps), points:null, time:null,
    gap:Array.isArray(row.gap_to_leader) ? null : row.gap_to_leader ?? null,
    bestLap:Array.isArray(row.duration) ? null : number(row.duration),
    qTimes:slug === 'sprint-qualifying' ? (Array.isArray(row.duration) ? [0,1,2].map(index => number(row.duration[index])) : [number(row.duration),null,null]) : null,
    status:row.dsq ? 'Disqualified' : row.dns ? 'Did not start' : row.dnf ? 'Retired' : null
  })).sort((a,b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}

export function normalizePits(rows, roster) {
  return rows.map(row => ({driver:rosterDriver(roster.find(driver => driver.driver_number === row.driver_number) || {driver_number:row.driver_number}), lap:number(row.lap_number), date:text(row.date), stopDuration:number(row.stop_duration), laneDuration:number(row.lane_duration ?? row.pit_duration)})).sort((a,b) => (a.lap ?? Infinity) - (b.lap ?? Infinity));
}

export function normalizeStints(rows, roster) {
  return rows.map(row => ({driver:rosterDriver(roster.find(driver => driver.driver_number === row.driver_number) || {driver_number:row.driver_number}), stint:number(row.stint_number), compound:text(row.compound), lapStart:number(row.lap_start), lapEnd:number(row.lap_end), tyreAge:number(row.tyre_age_at_start)})).sort((a,b) => (a.driver.number ?? Infinity) - (b.driver.number ?? Infinity) || (a.stint ?? Infinity) - (b.stint ?? Infinity));
}

export function normalizeLaps(rows, stints = [], pits = []) {
  return rows.map(row => {
    const matches = stints.filter(stint => stint.driver_number === row.driver_number && number(stint.lap_start) !== null && number(stint.lap_end) !== null && row.lap_number >= stint.lap_start && row.lap_number <= stint.lap_end);
    return { lap:number(row.lap_number), duration:number(row.lap_duration), sectors:[number(row.duration_sector_1),number(row.duration_sector_2),number(row.duration_sector_3)], compound:matches.length === 1 ? text(matches[0].compound) : null, outLap:typeof row.is_pit_out_lap === 'boolean' ? row.is_pit_out_lap : null, pitLap:pits.some(pit => pit.driver_number === row.driver_number && pit.lap_number === row.lap_number) };
  }).sort((a,b) => (a.lap ?? Infinity) - (b.lap ?? Infinity));
}

function emptySection(source, session, message = null) {
  const status = session.cancelled ? 'cancelled' : (session.start ?? Date.parse(session.date + 'T23:59:59Z')) > Date.now() ? 'scheduled' : 'awaiting';
  return {status,source,at:null,stale:false,data:[],message};
}

export function createResultsService({ upstream = createUpstream(), now = Date.now } = {}) {
  function empty(source, session, message = null) {
    const section = emptySection(source, session, message);
    if (!session.cancelled) section.status = (session.start ?? Date.parse(session.date + 'T23:59:59Z')) > now() ? 'scheduled' : 'awaiting';
    return section;
  }
  async function section(provider, route, session, normalize, options) {
    const source = provider === 'jolpica' ? 'Jolpica F1' : 'OpenF1';
    try {
      const result = await upstream.load(provider, route, options);
      const data = normalize(result.data);
      return {status:data.length ? 'available' : 'awaiting',data,source,at:result.at,stale:result.stale,message:result.message || null,retryAt:result.retryAt || null};
    } catch (error) {
      const recent = now() < (session.end ?? session.start ?? Date.parse(session.date)) + 86400000;
      return { ...empty(source, session), status:recent && [401,403].includes(error.status) ? 'awaiting' : 'failed', message:recent && [401,403].includes(error.status) ? 'Awaiting free publication after the session.' : error.message, retryAt:error.retryAt || null };
    }
  }
  async function getWeekend(season, round, force = false) {
    const raceResult = await upstream.load('jolpica', `${season}/${round}/?format=json&limit=100`, {force,validate:validRaces(season)});
    const race = raceResult.data.MRData.RaceTable.Races.find(row => String(row.round) === String(round) && row.Circuit && row.date);
    if (!race) throw new ProviderError('This weekend is not in the published calendar.', 404);
    let timing;
    try { timing = await upstream.load('openf1', `sessions?year=${season}`, {force,validate:validSessions}); }
    catch (error) { timing = {data:[],at:null,stale:false,message:error.message,source:'OpenF1'}; }
    const meetingKey = matchMeeting(race, season, timing.data);
    const meetingSessions = meetingKey === null ? [] : timing.data.filter(row => row.meeting_key === meetingKey);
    const list = sessions(race).map(session => {
      const matches = meetingSessions.filter(row => openSlug(row.session_name) === session.slug);
      const matched = matches.length === 1 ? matches[0] : null;
      return {...session, start:timestamp(session) ?? (matched ? number(Date.parse(matched.date_start)) : null), end:matched ? number(Date.parse(matched.date_end)) : null, sessionKey:Number.isInteger(matched?.session_key) ? matched.session_key : null, cancelled:matched?.is_cancelled === true};
    });
    return {season:String(season),round:String(round),name:race.raceName,circuitId:race.Circuit.circuitId,circuit:race.Circuit.circuitName,location:race.Circuit.Location?.locality || null,country:race.Circuit.Location?.country || null,date:race.date,time:race.time || null,sessions:list,meetingKey,...pollingWindow(race,list),metadata:{calendar:{source:'Jolpica F1',at:raceResult.at,stale:raceResult.stale,message:raceResult.message || null},timing:{source:'OpenF1',at:timing.at,stale:timing.stale,message:timing.message || (meetingKey === null ? 'Matching timing sessions are not available.' : null)}}};
  }
  async function context(season, round, slug, force) {
    const weekend = await getWeekend(season, round);
    const session = weekend.sessions.find(item => item.slug === slug);
    if (!session) throw new ProviderError('This session is not part of the weekend.', 404);
    return {weekend,session,options:{ttl:resultTTL(weekend,now()),force}};
  }
  async function getSession(season, round, slug, force = false) {
    const {weekend,session,options} = await context(season, round, slug, force);
    const source = ['race','sprint','qualifying'].includes(slug) ? 'Jolpica F1' : 'OpenF1';
    if (session.cancelled || empty(source,session).status === 'scheduled') return {weekend,session,drivers:empty('OpenF1',session),results:empty(source,session),pits:empty('OpenF1',session),tires:empty('OpenF1',session)};
    const mappingMessage = weekend.metadata.timing.message || 'Matching timing sessions are not available.';
    const drivers = session.sessionKey === null ? empty('OpenF1',session,mappingMessage) : await section('openf1', `drivers?session_key=${session.sessionKey}`, session, data => data, {...options,validate:validTiming});
    const roster = drivers.data;
    const requests = [];
    if (source === 'Jolpica F1') {
      const endpoint = slug === 'qualifying' ? 'qualifying' : slug === 'sprint' ? 'sprint' : 'results';
      const field = slug === 'qualifying' ? 'QualifyingResults' : slug === 'sprint' ? 'SprintResults' : 'Results';
      requests.push(section('jolpica', `${season}/${round}/${endpoint}/?format=json&limit=100`, session, data => {
        const race = data.MRData.RaceTable.Races.find(row => String(row.round) === String(round));
        const rows = race?.[field] || [];
        if (!Array.isArray(rows)) throw new Error('Invalid results response.');
        return normalizeJolpica(rows,roster,slug);
      }, {...options,validate:data => {
        validRaces(season)(data);
        const race = data.MRData.RaceTable.Races.find(row => String(row.round) === String(round));
        if (race && (!Array.isArray(race[field]) || race[field].some(row => !row.Driver || !row.Constructor))) throw new Error('Invalid classification response.');
      }}));
    } else requests.push(session.sessionKey === null ? empty(source,session,mappingMessage) : section('openf1', `session_result?session_key=${session.sessionKey}`, session, data => normalizeOpenResults(data,roster,slug), {...options,validate:validTiming}));
    for (const [endpoint,normalize] of [['pit',normalizePits],['stints',normalizeStints]]) {
      requests.push(session.sessionKey === null ? empty('OpenF1',session,mappingMessage) : section('openf1', `${endpoint}?session_key=${session.sessionKey}`, session, data => normalize(data,roster), {...options,validate:validTiming}));
    }
    const [results,pits,tires] = await Promise.all(requests);
    const published = results.status === 'available';
    // An empty activity dataset is meaningful once the session classification is published.
    for (const activity of [pits,tires]) if (published && activity.at && activity.status === 'awaiting') activity.status = 'available';
    return {weekend,session,drivers:{...drivers,data:roster.map(rosterDriver)},results,pits,tires};
  }
  async function getLaps(season, round, slug, driver, force = false) {
    const {session,options} = await context(season,round,slug,force);
    if (session.cancelled || empty('OpenF1',session).status === 'scheduled' || session.sessionKey === null) return {session,driver:null,laps:empty('OpenF1',session,'Lap timing is not available for this session.')};
    const roster = await section('openf1', `drivers?session_key=${session.sessionKey}`, session, data => data, {...options,validate:validTiming});
    const matched = roster.data.filter(row => row.driver_number === driver);
    if (roster.status !== 'available') return {session,driver:null,laps:{...roster,data:[]}};
    if (matched.length !== 1) throw new ProviderError('This driver is not in the session roster.',404);
    const [lapData,stints,pits] = await Promise.all([
      section('openf1',`laps?session_key=${session.sessionKey}&driver_number=${driver}`,session,data => data,{...options,validate:validTiming}),
      section('openf1',`stints?session_key=${session.sessionKey}`,session,data => data,{...options,validate:validTiming}),
      section('openf1',`pit?session_key=${session.sessionKey}`,session,data => data,{...options,validate:validTiming})
    ]);
    return {session,driver:rosterDriver(matched[0]),laps:{...lapData,data:normalizeLaps(lapData.data,stints.data,pits.data)},annotations:{tires:{status:stints.status,stale:stints.stale},pits:{status:pits.status,stale:pits.stale}}};
  }
  async function getJolpica(route, force = false) {
    return upstream.load('jolpica',route + '?format=json&limit=100',{force,validate:data => {if (!data?.MRData) throw new Error('Invalid provider response.');}});
  }
  const {getTrack} = createTrackService({upstream,getWeekend,now});
  return {getWeekend,getSession,getLaps,getJolpica,getTrack};
}
