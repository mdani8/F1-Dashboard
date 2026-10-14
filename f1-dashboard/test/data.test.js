import test from 'node:test';
import assert from 'node:assert/strict';
import { TTL, createDataClient, timestamp, sessions, nextRace, nextSession, displayDate, displaySession, validateCalendar, validateStandings } from '../shared/data.js';

const race = { round:'1', raceName:'Test Grand Prix', Circuit:{circuitName:'Test Circuit'}, date:'2026-10-04', time:'23:00:00Z', FirstPractice:{date:'2026-10-02',time:'10:00:00Z'}, Qualifying:{date:'2026-10-03',time:'14:00:00Z'}, SprintQualifying:{date:'2026-10-02',time:'14:00:00Z'}, Sprint:{date:'2026-10-03',time:'10:00:00Z'} };
const calendar = { MRData:{RaceTable:{season:'2026',Races:[race]}} };
function store() { const map = new Map(); return { getItem:key => map.get(key), setItem:(key,value) => map.set(key,value) }; }
test('timed dates cross into the viewer’s next day; date-only dates do not shift', () => {
  assert.match(displaySession(race,'Asia/Tokyo'), /5 Oct · 08:00/);
  assert.equal(displayDate({date:'2026-10-04'},'America/Los_Angeles',{day:'numeric'}),'4');
  assert.match(displaySession({date:'2026-10-04'},'Europe/Brussels'), /4 Oct · Time TBC/);
  assert.equal(timestamp({date:'2026-10-04'}),null);
});
test('sprint sessions are chronological and absent sessions are omitted', () => {
  assert.deepEqual(sessions(race).map(s => s.name), ['Practice 1','Sprint qualifying','Sprint','Qualifying','Race']);
  assert.equal(sessions({...race,SprintShootout:race.SprintQualifying}).filter(s => s.name === 'Sprint qualifying').length,1);
  assert.deepEqual(sessions({date:'2026-10-04'}).map(s => s.name),['Race']);
});
test('next race and session advance; completed season and empty season return null', () => {
  assert.equal(nextSession(race,Date.parse('2026-10-03T12:00:00Z')).name,'Qualifying');
  assert.equal(nextRace([race],Date.parse('2026-10-05T00:00:00Z')),null);
  assert.equal(nextRace([],0),null);
  assert.equal(nextRace([{...race,time:undefined}],Date.parse('2026-10-04T20:00:00Z')).round,'1');
});
test('cached data stays fresh for 15 minutes; force and expiry request new data', async () => {
  let now = 1000, calls = 0;
  const client = createDataClient({storage:store(), now:() => now, fetcher:async () => { calls++; return {ok:true,json:async () => calendar}; }});
  await client.load('calendar','current/races/',validateCalendar);
  now += TTL - 1;
  await client.load('calendar','current/races/',validateCalendar);
  assert.equal(calls,1);
  now++;
  await client.load('calendar','current/races/',validateCalendar);
  assert.equal(calls,2);
  await client.load('calendar','current/races/',validateCalendar,true);
  assert.equal(calls,3);
});
test('failed refresh retains stale successful data; an uncached section rejects', async () => {
  let fail = false;
  const client = createDataClient({storage:store(),fetcher:async () => { if (fail) throw new Error('offline'); return {ok:true,json:async () => calendar}; }});
  await client.load('calendar','current/races/',validateCalendar);
  fail = true;
  const result = await client.load('calendar','current/races/',validateCalendar,true);
  assert.equal(result.stale,true);
  assert.deepEqual(result.data,calendar);
  await assert.rejects(client.load('drivers','2026/driverstandings/',() => {}), /offline/);
});
test('HTTP throttling, malformed payloads, and blocked storage are handled', async () => {
  const blocked = {getItem:() => {throw new Error('blocked');},setItem:() => {throw new Error('blocked');}};
  const client = createDataClient({storage:blocked,fetcher:async () => ({ok:true,json:async () => calendar})});
  assert.equal((await client.load('calendar','current/races/',validateCalendar)).stale,false);
  const throttled = createDataClient({fetcher:async () => ({ok:false,status:429})});
  await assert.rejects(throttled.load('calendar','current/races/',validateCalendar), /busy/);
  const invalid = createDataClient({fetcher:async () => ({ok:true,json:async () => ({})})});
  await assert.rejects(invalid.load('calendar','current/races/',validateCalendar), /unavailable/);
});
test('empty preseason standings are valid and another season is rejected', () => {
  assert.equal(validateStandings({MRData:{StandingsTable:{season:'2026',StandingsLists:[]}}},'2026','DriverStandings'),null);
  assert.throws(() => validateStandings({MRData:{StandingsTable:{season:'2025',StandingsLists:[]}}},'2026','DriverStandings'));
});
test('calendar and standings caches are isolated across season rollover', async () => {
  const storage = store();
  const oldClient = createDataClient({storage,fetcher:async () => ({ok:true,json:async () => calendar})});
  await oldClient.load('calendar:2026','current/races/',validateCalendar);
  const newClient = createDataClient({storage,fetcher:async () => {throw new Error('offline');}});
  await assert.rejects(newClient.load('calendar:2027','current/races/',validateCalendar),/offline/);
});
