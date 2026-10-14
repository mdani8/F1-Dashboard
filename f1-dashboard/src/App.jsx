import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { createDataClient } from '../shared/data.js';
import { createWeekendClient } from '../shared/weekend-client.js';
import { parseWeekendRoute } from '../shared/weekend-model.js';
import { useHash, useVisibility, useClock, useDashboardData, useWeekendData } from './hooks.js';
import { Dashboard } from './Dashboard.jsx';
import { Weekend } from './Weekend.jsx';
import { MotionButton, MotionLink, PageReveal, RefreshIcon } from './motion.jsx';

function browserStorage() {try {return window.localStorage;} catch {return undefined;}}

export function App() {
  const hash = useHash();
  const route = useMemo(() => parseWeekendRoute(hash),[hash]);
  const visible = useVisibility();
  const [announcement,setAnnouncement] = useState('');
  const [selection,setSelection] = useState({tab:'drivers',season:null,openRounds:new Set()});
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',[]);
  const clients = useMemo(() => {const storage = browserStorage();return {dashboard:createDataClient({storage}),weekend:createWeekendClient({storage})};},[]);
  const dashboard = useDashboardData(clients.dashboard,!route,setAnnouncement);
  const weekend = useWeekendData(clients.weekend,route,hash,visible,setAnnouncement);
  const time = useClock(!route && visible);
  const busy = route ? weekend.busy : dashboard.busy;
  const dashboardScroll = useRef(0);
  const previous = useRef({route:null,hash:null});
  useEffect(() => {document.body.dataset.appReady = 'true';},[]);
  useLayoutEffect(() => {
    const old = previous.current;
    if (route && !old.route) dashboardScroll.current = scrollY;
    if (route && (!old.route || old.route.season !== route.season || old.route.round !== route.round)) window.scrollTo({top:0,behavior:'instant'});
    if (!route && !old.route && hash !== old.hash) requestAnimationFrame(() => {if (hash === '#calendar' || hash === '#standings') document.querySelector(hash)?.scrollIntoView({behavior:'instant'});});
    previous.current = {route,hash};
  },[route,hash]);
  useEffect(() => {
    const session = route && weekend.weekend?.sessions.find(item => item.slug === (route.session || weekend.selectedSession));
    document.title = session ? `${weekend.weekend.name} · ${session.name} — Gridline` : 'Gridline — F1 Championship';
  },[route,weekend.weekend,weekend.selectedSession]);
  function enteredDashboard() {
    if (location.hash === '#calendar' || location.hash === '#standings') document.querySelector(location.hash)?.scrollIntoView({behavior:'instant'});
    else window.scrollTo({top:dashboardScroll.current,behavior:'instant'});
  }
  return <>
    <a className="skip-link" href={route ? '#session-content' : '#standings'} onClick={event => {if (route) {event.preventDefault();const panel = document.querySelector('#session-content');panel?.focus();panel?.scrollIntoView();}}}>Skip to {route ? 'session results' : 'standings'}</a>
    <header className="topbar"><MotionLink href="#" className="brand" aria-label="Gridline home"><span className="brand-mark" aria-hidden="true">///</span> GRIDLINE<span className="brand-sub">FORMULA 1</span></MotionLink><nav aria-label="Main navigation"><MotionLink href="#standings">Standings</MotionLink><MotionLink href="#calendar">Race calendar</MotionLink></nav><MotionButton id="refresh" className="refresh" aria-disabled={busy} onClick={() => {if (!busy) route ? weekend.refresh(true) : dashboard.refresh(true);}}><RefreshIcon busy={busy} />{busy ? 'Refreshing' : 'Refresh'}</MotionButton></header>
    <main><AnimatePresence mode="wait">{route ? <PageReveal key={`weekend-${route.season || 'invalid'}-${route.round || ''}`} id="weekend-view" data-ready-route={weekend.readyHash === location.hash && !weekend.busy ? location.hash : ''}><Weekend route={route} data={weekend} timezone={timezone} visible={visible} /></PageReveal> : <PageReveal key="dashboard" id="dashboard-view" onEntered={enteredDashboard}><Dashboard data={dashboard} selection={selection} setSelection={setSelection} timezone={timezone} time={time} /></PageReveal>}</AnimatePresence><p id="announcement" className="sr-only" role="status" aria-live="polite">{announcement}</p></main>
    <footer><span className="footer-brand">GRIDLINE <span>/</span> A fan’s view of Formula 1.</span><span>Data: <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener noreferrer">Jolpica F1</a> + <a href="https://openf1.org/" target="_blank" rel="noopener noreferrer">OpenF1</a> · Updates follow published session data.</span></footer>
  </>;
}
