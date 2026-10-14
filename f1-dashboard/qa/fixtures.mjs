export const fixtureNow = Date.parse('2026-03-14T08:00:00Z');
export const races = [
  {season:'2026',round:'1',raceName:'Australian Grand Prix',Circuit:{circuitId:'albert_park',circuitName:'Albert Park Grand Prix Circuit',Location:{locality:'Melbourne',country:'Australia'}},date:'2026-03-08',time:'04:00:00Z',FirstPractice:{date:'2026-03-06',time:'01:30:00Z'},SecondPractice:{date:'2026-03-06',time:'05:00:00Z'},ThirdPractice:{date:'2026-03-07',time:'01:30:00Z'},Qualifying:{date:'2026-03-07',time:'05:00:00Z'}},
  {season:'2026',round:'2',raceName:'Chinese Grand Prix',Circuit:{circuitId:'shanghai',circuitName:'Shanghai International Circuit',Location:{locality:'Shanghai',country:'China'}},date:'2026-03-15',time:'07:00:00Z',FirstPractice:{date:'2026-03-13',time:'03:30:00Z'},Qualifying:{date:'2026-03-14',time:'07:00:00Z'},Sprint:{date:'2026-03-14',time:'03:00:00Z'},SprintQualifying:{date:'2026-03-13',time:'07:30:00Z'}}
];
const sessionFields = [['FirstPractice','Practice 1'],['SecondPractice','Practice 2'],['ThirdPractice','Practice 3'],['Qualifying','Qualifying'],['SprintQualifying','Sprint Qualifying'],['Sprint','Sprint'],[null,'Race']];
export const timingSessions = races.flatMap(race => sessionFields.filter(([field]) => field === null || race[field]).map(([field,name],index) => {
  const session = field ? race[field] : race;
  return {year:2026,circuit_key:race.round === '1' ? 10 : 49,meeting_key:Number(race.round) + 100,session_key:Number(race.round) * 1000 + index,session_name:name,session_type:name.startsWith('Practice') ? 'Practice' : name,date_start:`${session.date}T${session.time.replace('Z','+00:00')}`,date_end:new Date(Date.parse(`${session.date}T${session.time}`) + 3600000).toISOString(),country_name:race.Circuit.Location.country,location:race.Circuit.Location.locality,circuit_short_name:race.Circuit.circuitName,is_cancelled:false};
}));
export const roster = [
  {driver_number:1,name_acronym:'VER',full_name:'Max VERSTAPPEN',team_name:'Red Bull Racing',team_colour:'548aff'},
  {driver_number:4,name_acronym:'NOR',full_name:'Lando NORRIS',team_name:'McLaren',team_colour:'ff8700'},
  {driver_number:44,name_acronym:'HAM',full_name:'Lewis HAMILTON',team_name:'Ferrari',team_colour:'ef3340'}
];
const drivers = [
  {driverId:'max_verstappen',permanentNumber:'33',code:'VER',givenName:'Max',familyName:'Verstappen'},
  {driverId:'norris',permanentNumber:'4',code:'NOR',givenName:'Lando',familyName:'Norris'},
  {driverId:'hamilton',permanentNumber:'44',code:'HAM',givenName:'Lewis',familyName:'Hamilton'}
];
export const classification = drivers.map((Driver,index) => ({number:String(roster[index].driver_number),position:String(index + 1),positionText:String(index + 1),Driver,Constructor:{constructorId:['red_bull','mclaren','ferrari'][index],name:roster[index].team_name},grid:String(index + 1),laps:String(index === 2 ? 34 : 56),status:index === 2 ? 'Retired' : 'Finished',...(index === 2 ? {} : {points:String(index === 0 ? 25 : 18)}),Time:index < 2 ? {time:index === 0 ? '1:32:15.123' : '+4.500'} : undefined,Q1:'1:20.123',Q2:index === 2 ? '' : '1:19.500',Q3:index > 0 ? undefined : '1:19.100'}));
export const openResults = roster.map((driver,index) => ({driver_number:driver.driver_number,position:index + 1,duration:80.123 + index,gap_to_leader:index,number_of_laps:22 - index,dnf:false,dns:false,dsq:index === 2}));
export const stints = [
  {driver_number:1,stint_number:1,compound:'MEDIUM',lap_start:1,lap_end:2,tyre_age_at_start:0},
  {driver_number:1,stint_number:2,compound:'HARD',lap_start:3,lap_end:56,tyre_age_at_start:2},
  {driver_number:4,stint_number:1,compound:'SOFT',lap_start:1,lap_end:56,tyre_age_at_start:1},
  {driver_number:44,stint_number:1,compound:null,lap_start:1,lap_end:null,tyre_age_at_start:null}
];
export const pits = [{driver_number:1,lap_number:2,date:'2026-03-14T03:10:00Z',stop_duration:2.3,lane_duration:22.5}];
export const laps = [
  {driver_number:1,lap_number:1,lap_duration:null,duration_sector_1:null,duration_sector_2:28.2,duration_sector_3:24.5,is_pit_out_lap:true},
  {driver_number:1,lap_number:2,lap_duration:80.123,duration_sector_1:27.423,duration_sector_2:28.2,duration_sector_3:24.5,is_pit_out_lap:false},
  {driver_number:1,lap_number:3,lap_duration:80.5,duration_sector_1:27.8,duration_sector_3:24.5,is_pit_out_lap:true}
];

export function trackLap(session) {
  return {driver_number:1,session_key:session.session_key,lap_number:3,date_start:new Date(Date.parse(session.date_start) + 600000).toISOString(),
    lap_duration:80.123,duration_sector_1:26,duration_sector_2:29,duration_sector_3:25.123,is_pit_out_lap:false};
}
export function trackPositions(lap) {
  return Array.from({length:161},(_,index) => {
    const fraction = index / 160, angle = fraction * Math.PI * 2;
    return {session_key:lap.session_key,driver_number:lap.driver_number,date:new Date(Date.parse(lap.date_start) + lap.lap_duration * 1000 * fraction).toISOString(),
      x:Math.cos(angle) * 2100,y:Math.sin(angle) * 1600};
  });
}

export function createFixtureFetcher({override = () => undefined} = {}) {
  const calls = [];
  async function fetcher(input, options) {
    const url = new URL(input);
    calls.push({url,options});
    const replacement = await override(url,options);
    if (replacement !== undefined) return replacement;
    let data;
    if (url.hostname === 'api.openf1.org') {
      const endpoint = url.pathname.split('/').at(-1);
      const session = timingSessions.find(row => String(row.session_key) === url.searchParams.get('session_key'));
      if (endpoint === 'sessions') data = timingSessions;
      else if (endpoint === 'drivers') data = roster;
      else if (endpoint === 'session_result') data = openResults.map(row => ({...row,duration:session?.session_name === 'Sprint Qualifying' ? [row.duration,row.duration - 1,row.duration - 2] : row.duration}));
      else if (endpoint === 'pit') data = pits;
      else if (endpoint === 'stints') data = stints;
      else if (endpoint === 'laps') data = url.searchParams.has('driver_number') ? laps.map(row => ({...row,driver_number:Number(url.searchParams.get('driver_number'))})) : session ? [trackLap(session)] : [];
      else if (endpoint === 'location') data = session ? trackPositions(trackLap(session)) : [];
      else throw new Error('Unexpected fixture endpoint: ' + url);
    } else {
      const route = url.pathname.replace('/ergast/f1/','');
      if (route.endsWith('driverstandings/')) data = {MRData:{StandingsTable:{season:'2026',StandingsLists:[{season:'2026',round:'1',DriverStandings:classification.map(row => ({...row,wins:'1',Constructors:[row.Constructor]}))}]}}};
      else if (route.endsWith('constructorstandings/')) data = {MRData:{StandingsTable:{season:'2026',StandingsLists:[{season:'2026',round:'1',ConstructorStandings:classification.map(row => ({position:row.position,points:row.points || '0',wins:'1',Constructor:row.Constructor}))}]}}};
      else {
        const round = /^2026\/(\d+)\//.exec(route)?.[1];
        let selected = round ? races.filter(race => race.round === round) : races;
        const field = route.endsWith('qualifying/') ? 'QualifyingResults' : route.endsWith('sprint/') ? 'SprintResults' : route.endsWith('results/') ? 'Results' : null;
        if (field) selected = selected.map(race => ({...race,[field]:classification}));
        data = {MRData:{RaceTable:{season:'2026',Races:selected}}};
      }
    }
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return {fetcher,calls};
}
