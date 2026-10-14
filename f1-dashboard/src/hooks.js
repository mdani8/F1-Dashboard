import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { validateCalendar, validateStandings } from '../shared/data.js';
import { validateWeekend, validateSession, validateLaps } from '../shared/weekend-client.js';
import { defaultSession, resultTTL, shouldPoll, REFRESH_INTERVAL, weekendHref } from '../shared/weekend-model.js';

export function useHash() {
  const [hash,setHash] = useState(() => location.hash);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener('hashchange',changed);
    return () => window.removeEventListener('hashchange',changed);
  },[]);
  return hash;
}

export function useVisibility() {
  const [visible,setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange',changed);
    return () => document.removeEventListener('visibilitychange',changed);
  },[]);
  return visible;
}

export function useClock(enabled) {
  const [time,setTime] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    setTime(Date.now());
    const timer = setInterval(() => setTime(Date.now()),REFRESH_INTERVAL);
    return () => clearInterval(timer);
  },[enabled]);
  return time;
}

export function useDashboardData(client,enabled,announce) {
  const [state,setState] = useState({calendar:null,drivers:null,constructors:null,calendarError:null,driversError:null,constructorsError:null,busy:false});
  const latest = useRef(state);
  const busy = useRef(false);
  const mounted = useRef(true);
  const commit = useCallback(patch => {
    if (!mounted.current) return;
    latest.current = {...latest.current,...patch};
    setState(latest.current);
  },[]);
  useEffect(() => {mounted.current = true;return () => {mounted.current = false;};},[]);
  const refresh = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    commit({busy:true});
    announce('Refreshing championship data.');
    let errors = 0;
    try {
      let calendar;
      try {
        calendar = await client.load(`calendar:${new Date().getUTCFullYear()}`,'current/races/',validateCalendar,force);
      } catch (error) {
        errors++;
        if (!latest.current.calendar) {
          commit({calendarError:'Could not load the current season calendar.',driversError:'Standings need the current season calendar.',constructorsError:'Standings need the current season calendar.'});
          return;
        }
        calendar = {...latest.current.calendar,stale:true};
      }
      commit({calendar,calendarError:null});
      if (calendar.stale) errors++;
      const season = validateCalendar(calendar.data).season;
      await Promise.all(['drivers','constructors'].map(async kind => {
        try {
          const result = await client.load(`${season}:${kind}`,`${season}/${kind === 'drivers' ? 'driverstandings' : 'constructorstandings'}/`,data => validateStandings(data,season,kind === 'drivers' ? 'DriverStandings' : 'ConstructorStandings'),force);
          commit({[kind]:result,[kind + 'Error']:null});
          if (result.stale) errors++;
        } catch (error) {
          errors++;
          const previous = latest.current[kind];
          commit(previous ? {[kind]:{...previous,stale:true}} : {[kind + 'Error']:`Could not load ${kind === 'drivers' ? 'driver' : 'constructor'} standings.`});
        }
      }));
    } finally {
      busy.current = false;
      commit({busy:false});
      announce(errors ? 'Some championship data is unavailable or out of date.' : 'Championship data updated.');
    }
  },[client,commit,announce]);
  useEffect(() => {if (enabled && !latest.current.calendar) refresh();},[enabled,refresh]);
  return {...state,busy:state.busy || enabled && !state.calendar && !state.calendarError,refresh};
}

const initialWeekend = {weekend:null,bundle:null,lapBundle:null,selectedSession:null,busy:false,error:null,readyHash:null};

export function useWeekendData(client,route,hash,visible,announce) {
  const [state,setState] = useState(initialWeekend);
  const latest = useRef(state);
  const version = useRef(0);
  const request = useRef(null);
  const busy = useRef(false);
  const scroll = useRef(null);
  const commit = useCallback((patch,preserve = false) => {
    if (preserve) scroll.current = {hash:location.hash,x:scrollX,y:scrollY,focused:document.activeElement};
    latest.current = {...latest.current,...patch};
    setState(latest.current);
  },[]);
  useLayoutEffect(() => {
    const saved = scroll.current;
    scroll.current = null;
    if (!saved || saved.hash !== location.hash) return;
    if (saved.focused?.isConnected) saved.focused.focus?.({preventScroll:true});
    window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'});
  },[state]);
  const refresh = useCallback(async (force = false) => {
    if (!route || route.invalid || busy.current) return;
    const current = ++version.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const signal = controller.signal;
    const valid = () => version.current === current && !signal.aborted;
    busy.current = true;
    commit({busy:true,error:null,readyHash:null});
    const base = `/api/weekends/${route.season}/${route.round}`;
    try {
      const metadata = await client.load(base,{force,signal,validate:validateWeekend});
      if (!valid()) return;
      const slug = route.session || latest.current.selectedSession || defaultSession(metadata.sessions);
      if (!metadata.sessions.some(session => session.slug === slug)) throw new Error('This session is not part of the published weekend.');
      if (!route.session) history.replaceState(null,'',weekendHref(route.season,route.round,slug,route.driver));
      commit({weekend:metadata,selectedSession:slug},true);
      const sessionPath = base + '/sessions/' + slug;
      const bundle = await client.load(sessionPath,{ttl:resultTTL(metadata),force,signal,validate:validateSession});
      if (!valid()) return;
      commit({bundle,weekend:bundle.weekend || metadata},true);
      if (route.driver !== null) {
        try {
          const lapBundle = await client.load(sessionPath + '/laps?driver=' + route.driver,{ttl:resultTTL(bundle.weekend || metadata),force,signal,validate:validateLaps});
          if (!valid()) return;
          commit({lapBundle},true);
        } catch (error) {
          if (!valid()) return;
          commit({lapBundle:{session:bundle.session,driver:{number:route.driver,name:'Selected driver'},laps:{status:'failed',source:'OpenF1',at:null,data:[],stale:false,message:error.message}}},true);
        }
      }
      if (valid()) announce('Published session data checked.');
    } catch (error) {
      if (valid()) {commit({error:error.message},true);announce('Some session data could not be loaded.');}
    } finally {
      if (valid()) {busy.current = false;commit({busy:false,readyHash:location.hash},true);}
    }
  },[route,client,commit,announce]);

  useEffect(() => {
    version.current++;
    request.current?.abort();
    busy.current = false;
    if (!route) return;
    if (route.invalid) {commit({...initialWeekend,error:'This results link is invalid.',readyHash:location.hash});return;}
    const previous = latest.current;
    const sameWeekend = previous.weekend?.season === route.season && previous.weekend?.round === route.round;
    const slug = route.session || (sameWeekend ? previous.selectedSession : null);
    const sameSession = sameWeekend && previous.bundle?.session?.slug === slug;
    commit({weekend:sameWeekend ? previous.weekend : null,selectedSession:slug,bundle:sameSession ? previous.bundle : null,lapBundle:sameSession && previous.lapBundle?.driver?.number === route.driver ? previous.lapBundle : null,error:null,readyHash:null});
    refresh();
    return () => {version.current++;request.current?.abort();busy.current = false;};
  },[hash,route,refresh,commit]);

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current && route && latest.current.weekend) refresh();
    wasVisible.current = visible;
    if (!visible || !route || route.invalid) return;
    const timer = setInterval(() => {
      if (shouldPoll(latest.current.weekend,{visible:!document.hidden})) refresh();
    },REFRESH_INTERVAL);
    return () => clearInterval(timer);
  },[visible,route,refresh]);
  return {...state,busy:state.busy || Boolean(route && !route.invalid && state.readyHash !== location.hash),refresh};
}
