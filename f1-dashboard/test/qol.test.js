import test from 'node:test';
import assert from 'node:assert/strict';
import { driverKey, teamKey, sanitizeFavourites, countdown, weekendCalendar, filteredLaps, fastestLaps } from '../shared/qol.js';

test('favourites match driver identity across number changes and distinguish the Red Bull teams',() => {
  assert.equal(driverKey({code:'VER',number:1}),driverKey({code:'VER',number:33}));
  assert.equal(driverKey({givenName:'George',familyName:'Russell'}),driverKey({name:'George RUSSELL'}));
  assert.equal(teamKey({constructorId:'red_bull'}),teamKey('Oracle Red Bull Racing'));
  assert.equal(teamKey({constructorId:'rb'}),teamKey('Visa Cash App Racing Bulls'));
  assert.notEqual(teamKey('Racing Bulls'),teamKey('Red Bull Racing'));
  assert.deepEqual(sanitizeFavourites({drivers:['code:NOR','code:NOR','<script>',null],teams:['mclaren','mclaren',5]}),{drivers:['code:NOR'],teams:['mclaren']});
});

test('countdowns advance sessions, skip cancellations and retain unknown start times',() => {
  const now = Date.parse('2026-03-28T12:00:00Z');
  const items = [{name:'Cancelled',date:'2026-03-28',start:now + 5000,cancelled:true},{name:'Qualifying',date:'2026-03-28',start:now + 90061000},{name:'Race',date:'2026-03-30',time:'14:00:00Z'}];
  assert.equal(countdown(items,now).text,'1d 1h 01m 01s');
  assert.equal(countdown(items,now + 90061000).text,'Starting now');
  assert.equal(countdown(items,now + 90061001).session.name,'Race');
  assert.equal(countdown([{name:'Practice',date:'2026-03-28'}],now).text,'Time TBC');
  assert.equal(countdown(items,now + 9 * 86400000),null);
});

test('calendar export uses UTC around DST, all-day TBC events and stable session IDs',() => {
  const weekend = {season:'2026',round:'1',name:'Test, Grand Prix; 🏁',circuit:'Circuit\nNew line',sessions:[
    {slug:'qualifying',name:'Qualifying',date:'2026-03-28',time:'13:00:00Z',end:Date.parse('2026-03-28T14:00:00Z')},
    {slug:'race',name:'Race',date:'2026-03-29',time:'13:00:00Z'},
    {slug:'practice-1',name:'Practice 1',date:'2026-03-27',cancelled:true}
  ]};
  const calendar = weekendCalendar(weekend,{now:Date.parse('2026-03-20T00:00:00Z')});
  assert.match(calendar,/DTSTART:20260328T130000Z/);
  assert.match(calendar,/DTSTART:20260329T130000Z/);
  assert.match(calendar,/DTEND:20260328T140000Z/);
  assert.match(calendar,/DTSTART;VALUE=DATE:20260327/);
  assert.match(calendar,/DTEND;VALUE=DATE:20260328/);
  assert.match(calendar,/STATUS:CANCELLED/);
  assert.match(calendar,/UID:gridline-2026-1-race@gridline.local/);
  assert.match(calendar,/Test\\, Grand Prix\\; 🏁/);
  assert.match(calendar,/LOCATION:Circuit\\nNew line/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length,3);
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
});

test('calendar line folding preserves Unicode and the iCalendar 75-byte limit',() => {
  const title = 'é'.repeat(75) + '🏁'.repeat(15);
  const calendar = weekendCalendar({season:'2026',round:'2',name:title,sessions:[{name:'Race',slug:'race',date:'2026-01-01',time:'00:00:00Z'}]},{now:0});
  assert.ok(calendar.split('\r\n').every(line => Buffer.byteLength(line,'utf8') <= 75));
  const unfolded = calendar.replace(/\r\n /g,'');
  assert.ok(unfolded.includes(title));
});

test('lap filters retain unknown records and fastest markers exclude pit/out laps',() => {
  const laps = [{lap:1,duration:60,outLap:true,pitLap:false},{lap:2,duration:61,outLap:false,pitLap:true},{lap:3,duration:80.123,outLap:false,pitLap:false},{lap:4,duration:80.123,outLap:false,pitLap:false},{lap:5,duration:null,outLap:false,pitLap:false},{lap:6,duration:79,outLap:null,pitLap:false}];
  assert.equal(filteredLaps(laps,'all').length,6);
  assert.deepEqual(filteredLaps(laps,'clean').map(row => row.lap),[3,4]);
  assert.deepEqual(filteredLaps(laps,'pit').map(row => row.lap),[2]);
  assert.deepEqual(filteredLaps(laps,'out').map(row => row.lap),[1]);
  assert.deepEqual([...fastestLaps(laps).numbers],[3,4]);
  assert.equal(fastestLaps(laps).duration,80.123);
  assert.equal(fastestLaps(laps,false).duration,null);
  assert.deepEqual(filteredLaps(laps,'clean',false),[]);
});
