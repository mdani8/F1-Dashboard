import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { displaySession } from '../shared/data.js';
import { formatDuration, shouldPoll, weekendHref } from '../shared/weekend-model.js';
import { ChangedCell, MotionLink, TireBar, timings } from './motion.jsx';
import { Compound, PanelHeading, SourceNote, TableHint, Tabs, Unavailable, Notice, dash, compoundName, compoundColors, SwitchingContent } from './ui.jsx';
import { CircuitMap } from './CircuitMap.jsx';
import { FavouriteButton, useFavourites } from './Favourites.jsx';
import { SessionCountdown, CalendarExport } from './WeekendTools.jsx';
import { filteredLaps, fastestLaps } from '../shared/qol.js';

function Driver({driver,weekend,session,selected}) {
  const favourites = useFavourites();
  const color = /^#[a-f\d]{6}$/i.test(driver.color || '') ? driver.color : '#999faa';
  const favourite = favourites.isDriver(driver) || favourites.isTeam(driver.team);
  const name = <span className="entrant-name">{driver.name}</span>;
  return <div className={`entrant ${favourite ? 'favourite-entrant' : ''}`} data-favourite={favourite ? 'true' : undefined}><span className="team-stripe" style={{'--team-color':color}} aria-hidden="true" /><div className="entrant-details"><div className="entrant-primary">{driver.number !== null ? <MotionLink className={`driver-link ${driver.number === selected ? 'selected' : ''}`} href={weekendHref(weekend.season,weekend.round,session.slug,driver.number)} aria-label={`Analyze ${driver.name} laps`}>{name}</MotionLink> : name}<FavouriteButton kind="drivers" value={driver} name={driver.name} /></div><div className="entrant-secondary"><span className="entrant-team">{driver.team || 'Team unavailable'}</span>{driver.team && <FavouriteButton kind="teams" value={driver.team} name={driver.team} />}</div></div></div>;
}

function Results({section,weekend,session,selected,onRetry}) {
  const favourites = useFavourites();
  if (section?.status !== 'available') return <Unavailable section={section} noun="results" onRetry={onRetry} />;
  if (!section.data.length) return <p className="message">No classification has been published.</p>;
  const race = ['race','sprint'].includes(session.slug), qualifying = ['qualifying','sprint-qualifying'].includes(session.slug);
  const headings = race ? ['POS','DRIVER / TEAM','GRID','TIME / GAP','STATUS','LAPS','PTS'] : qualifying ? ['POS','DRIVER / TEAM','Q1','Q2','Q3','STATUS'] : ['POS','DRIVER / TEAM','BEST LAP','GAP','LAPS'];
  return <><div className="table-wrap" id="results-scroll" tabIndex="0" role="region" aria-label="Scrollable session results"><table className="session-table" aria-label={`${session.name} results`}><thead><tr>{headings.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{section.data.map(row => <tr key={section.source === 'Jolpica F1' ? row.driver.code || row.driver.name : row.driver.number} data-favourite={favourites.isDriver(row.driver) || favourites.isTeam(row.driver.team) ? 'true' : undefined} className={[row.driver.number === selected ? 'selected-driver' : '',favourites.isDriver(row.driver) || favourites.isTeam(row.driver.team) ? 'favourite-row' : ''].filter(Boolean).join(' ')}>
    <ChangedCell className="position" value={row.positionLabel}>{row.positionLabel}</ChangedCell><td><Driver driver={row.driver} weekend={weekend} session={session} selected={selected} /></td>
    {race ? <><ChangedCell value={row.grid}>{dash(row.grid)}</ChangedCell><ChangedCell value={row.gap || row.time}>{dash(row.gap || row.time)}</ChangedCell><ChangedCell value={row.status}>{dash(row.status)}</ChangedCell><ChangedCell value={row.laps}>{dash(row.laps)}</ChangedCell><ChangedCell className="points" value={row.points}>{row.points === null ? <span className="pending-points">Awaiting publication</span> : row.points}</ChangedCell></> : qualifying ? <>{(row.qTimes || [null,null,null]).map((value,index) => <ChangedCell value={value} key={index}>{typeof value === 'number' ? formatDuration(value) : dash(value)}</ChangedCell>)}<ChangedCell value={row.status}>{dash(row.status)}</ChangedCell></> : <><ChangedCell value={row.bestLap}>{formatDuration(row.bestLap)}</ChangedCell><ChangedCell value={row.gap}>{typeof row.gap === 'number' ? row.gap === 0 ? '—' : '+' + row.gap.toFixed(3) : dash(row.gap)}</ChangedCell><ChangedCell value={row.laps}>{dash(row.laps)}</ChangedCell></>}
  </tr>)}</tbody></table></div><TableHint /></>;
}

function Pits({section,weekend,session,selected,onRetry}) {
  if (section?.status !== 'available') return <Unavailable section={section} noun="pit-stop records" onRetry={onRetry} />;
  if (!section.data.length) return <p className="message">No pit activity is published for this session.</p>;
  return <><div className="table-wrap" id="pits-scroll" tabIndex="0" role="region" aria-label="Scrollable pit stops"><table className="pit-table" aria-label="Pit stops"><thead><tr>{['LAP','DRIVER','STOP','PIT LANE'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{section.data.map((pit,index) => <tr key={`${pit.driver.number}:${pit.lap}:${pit.date || index}`}><ChangedCell value={pit.lap}>{dash(pit.lap)}</ChangedCell><td><Driver driver={pit.driver} weekend={weekend} session={session} selected={selected} /></td><ChangedCell value={pit.stopDuration}>{pit.stopDuration === null ? '—' : pit.stopDuration.toFixed(3) + 's'}</ChangedCell><ChangedCell value={pit.laneDuration}>{pit.laneDuration === null ? '—' : pit.laneDuration.toFixed(3) + 's'}</ChangedCell></tr>)}</tbody></table></div><TableHint /><p className="panel-footnote">Stop = stationary time. Pit lane = total time travelling through the pit lane.</p></>;
}

function Tires({section,weekend,session,selected,onRetry}) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const stint of section?.data || []) {if (!map.has(stint.driver.number)) map.set(stint.driver.number,[]);map.get(stint.driver.number).push(stint);}
    return [...map.values()];
  },[section?.data]);
  if (section?.status !== 'available') return <Unavailable section={section} noun="tire stints" onRetry={onRetry} />;
  if (!section.data.length) return <p className="message">No tire stints are published for this session.</p>;
  const maxLap = Math.max(1,...section.data.map(stint => stint.lapEnd || stint.lapStart || 1));
  return <><div className="tire-legend">{['SOFT','MEDIUM','HARD','INTERMEDIATE','WET'].map(value => <Compound key={value} value={value} />)}</div><div className="tire-timelines">{groups.map(stints => <div key={stints[0].driver.number} className={`tire-driver ${stints[0].driver.number === selected ? 'selected-driver' : ''}`}>
    <Driver driver={stints[0].driver} weekend={weekend} session={session} selected={selected} /><div className="stint-track" aria-hidden="true">{stints.filter(stint => stint.lapStart !== null && stint.lapEnd !== null && stint.lapEnd >= stint.lapStart).map(stint => {
      const name = compoundName(stint.compound), left = Math.max(0,(stint.lapStart - 1) / maxLap * 100), width = Math.min(100 - left,(stint.lapEnd - stint.lapStart + 1) / maxLap * 100);
      return <TireBar key={stint.stint ?? stint.lapStart} className="stint-bar" style={{left:left + '%',width:width + '%'}} title={`${name} · laps ${stint.lapStart}–${stint.lapEnd}`} color={compoundColors[name] || '#9298a4'}>{name === 'INTERMEDIATE' ? 'I' : name === 'UNKNOWN' ? '?' : name[0]}</TireBar>;
    })}</div><ul className="stint-summary">{stints.map((stint,index) => {
      const length = stint.lapStart !== null && stint.lapEnd !== null ? stint.lapEnd - stint.lapStart + 1 : null;
      return <li key={stint.stint ?? index}><Compound value={stint.compound} /><span>L{dash(stint.lapStart)}–{dash(stint.lapEnd)} · {length === null ? 'Length unavailable' : `${length} ${length === 1 ? 'lap' : 'laps'}`} · Starting age: {stint.tyreAge === null ? 'unavailable' : `${stint.tyreAge} ${stint.tyreAge === 1 ? 'lap' : 'laps'}`}</span></li>;
    })}</ul>
  </div>)}</div></>;
}

function LapRecords({bundle,onRetry,filter}) {
  const section = bundle?.laps;
  if (section?.status !== 'available') return <Unavailable section={section} noun="lap records" onRetry={onRetry} />;
  const annotationsKnown = bundle.annotations?.pits?.status === 'available' && !bundle.annotations.pits.stale;
  const shown = filteredLaps(section.data,filter,annotationsKnown);
  const fastest = fastestLaps(section.data,annotationsKnown);
  return <><p className="lap-driver-name">{bundle.driver?.name || 'Selected driver'} <span className="muted">/ {bundle.session.name}</span></p><div className="lap-summary"><span>{shown.length} of {section.data.length} laps</span>{fastest.duration !== null && <span className="fastest-summary">◆ Fastest recorded clean lap {formatDuration(fastest.duration)}</span>}</div>{shown.length ? <><div className="table-wrap" id="laps-scroll" tabIndex="0" role="region" aria-label="Scrollable lap analysis"><table className="lap-table" aria-label="Driver lap and sector times"><thead><tr>{['LAP','LAP TIME','SECTOR 1','SECTOR 2','SECTOR 3','TIRE','NOTES'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{shown.map(lap => <tr key={lap.lap} className={fastest.numbers.has(lap.lap) ? 'fastest-lap' : undefined} data-fastest={fastest.numbers.has(lap.lap) ? 'true' : undefined}><td>{dash(lap.lap)}</td><ChangedCell value={lap.duration}>{formatDuration(lap.duration)}{fastest.numbers.has(lap.lap) && <span className="fastest-tag">FASTEST</span>}</ChangedCell>{lap.sectors.map((value,index) => <ChangedCell key={index} value={value}>{formatDuration(value)}</ChangedCell>)}<td><Compound value={lap.compound} /></td><ChangedCell className="lap-notes" value={[lap.outLap,lap.pitLap]}>{[lap.outLap ? 'Out lap' : '',lap.pitLap ? 'Pit lane' : ''].filter(Boolean).join(' · ') || '—'}</ChangedCell></tr>)}</tbody></table></div><TableHint /></> : <p className="message" role="status">{filter === 'clean' && !annotationsKnown ? 'Clean-lap flags are unavailable for this session.' : 'No laps match this filter.'}</p>}<p className="panel-footnote">Recorded lap timing. Fastest markers exclude known pit and out laps. Published classification determines session results.{Object.values(bundle.annotations || {}).some(value => value.status !== 'available' || value.stale) && ' Some tire or pit annotations are unavailable or cached.'}</p></>;
}

function DriverAnalysis({bundle,lapBundle,weekend,session,selected,timezone,onRetry}) {
  const [filter,setFilter] = useState('all');
  const favourites = useFavourites();
  const roster = bundle?.drivers?.data || [];
  return <section className="panel lap-panel" aria-labelledby="lap-title"><PanelHeading eyebrow="LAP BY LAP" title="Driver analysis" id="lap-title" number="04" /><div className="driver-picker"><div className="picker-field"><label htmlFor="lap-driver">Driver</label><select id="lap-driver" value={selected ?? ''} onChange={event => {location.hash = weekendHref(weekend.season,weekend.round,session.slug,event.target.value ? Number(event.target.value) : null);}}><option value="">Select a driver</option>{roster.map(driver => <option key={driver.number} value={driver.number}>{favourites.isDriver(driver) || favourites.isTeam(driver.team) ? '★ ' : ''}{driver.name}</option>)}</select></div>{selected !== null && <><div className="picker-field"><label htmlFor="lap-filter">Laps</label><select id="lap-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All laps</option><option value="clean">Clean laps</option><option value="pit">Pit laps</option><option value="out">Out laps</option></select></div><MotionLink className="text-link" href={weekendHref(weekend.season,weekend.round,session.slug)}>Close analysis</MotionLink></>}</div>
    {selected !== null ? <><SourceNote section={lapBundle?.laps} timezone={timezone} onRetry={onRetry} /><SwitchingContent identity={selected} duration={timings.analysis}><LapRecords bundle={lapBundle} onRetry={onRetry} filter={filter} /></SwitchingContent></> : <p className="message">Select a driver in the results or choose one above to see their lap and sector times.</p>}
  </section>;
}

function SessionContent({bundle,lapBundle,weekend,session,selected,timezone,onRetry}) {
  return <><div className="session-heading"><h2>{session.name}</h2><span>{displaySession(session,timezone)}</span></div>{!['race','sprint'].includes(session.slug) && <p className="points-note">No points awarded for this session.</p>}
    <section className="panel results-panel" aria-labelledby="results-title"><PanelHeading eyebrow="THE CLASSIFICATION" title="Session results" id="results-title" number="01" /><SourceNote section={bundle?.results} timezone={timezone} onRetry={onRetry} /><Results section={bundle?.results} weekend={weekend} session={session} selected={selected} onRetry={onRetry} /></section>
    <div className="strategy-grid"><section className="panel" aria-labelledby="pit-title"><PanelHeading eyebrow="THROUGH THE PIT LANE" title="Pit stops" id="pit-title" number="02" /><SourceNote section={bundle?.pits} timezone={timezone} onRetry={onRetry} /><Pits section={bundle?.pits} weekend={weekend} session={session} selected={selected} onRetry={onRetry} /></section><section className="panel" aria-labelledby="tire-title"><PanelHeading eyebrow="THE STRATEGY" title="Tire stints" id="tire-title" number="03" /><SourceNote section={bundle?.tires} timezone={timezone} onRetry={onRetry} /><Tires section={bundle?.tires} weekend={weekend} session={session} selected={selected} onRetry={onRetry} /></section></div>
    <DriverAnalysis bundle={bundle} lapBundle={lapBundle} weekend={weekend} session={session} selected={selected} timezone={timezone} onRetry={onRetry} />
  </>;
}

function SessionPanel({ready,...props}) {
  const frame = useRef(null), height = useRef(0), changing = useRef(false);
  const identity = `${props.session.slug}:${props.selected ?? ''}`;
  const previous = useRef(identity);
  const [heldHeight,setHeldHeight] = useState(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {if (!changing.current && frame.current) height.current = frame.current.getBoundingClientRect().height;});
    observer.observe(frame.current);
    return () => observer.disconnect();
  },[]);
  useLayoutEffect(() => {
    if (previous.current !== identity) {
      changing.current = true;
      setHeldHeight(height.current || frame.current.getBoundingClientRect().height);
      previous.current = identity;
    }
    if (!changing.current || !ready) return;
    // Keep the page tall enough while the old content exits and new data loads.
    // Otherwise the browser can clamp the scroll position before the request finishes.
    const timer = setTimeout(() => {
      const x = scrollX, y = scrollY;
      changing.current = false;
      setHeldHeight(null);
      requestAnimationFrame(() => window.scrollTo({left:x,top:y,behavior:'instant'}));
    },420);
    return () => clearTimeout(timer);
  },[identity,ready]);
  return <div ref={frame} id="session-content" role="tabpanel" tabIndex="0" aria-labelledby={`session-tab-${props.session.slug}`} style={{minHeight:heldHeight ?? undefined}}><SwitchingContent identity={props.session.slug}><SessionContent {...props} /></SwitchingContent></div>;
}

export function Weekend({route,data,timezone,visible}) {
  const onRetry = () => data.refresh(true);
  const sameWeekend = data.weekend?.season === route.season && data.weekend?.round === route.round;
  const weekend = sameWeekend ? data.weekend : null;
  const slug = route.session || data.selectedSession;
  const session = weekend?.sessions.find(item => item.slug === slug);
  if (route.invalid || data.error && !session) return <><MotionLink className="back-link" href="#calendar">← Race calendar</MotionLink><div className="panel"><h1 className="error-title">Weekend unavailable</h1><p className="message" role="status">{route.invalid ? 'This results link is invalid.' : data.error}</p>{!route.invalid && <div className="error-actions"><button className="retry" onClick={onRetry}>Retry</button></div>}</div></>;
  if (!session) return <><MotionLink className="back-link" href="#calendar">← Race calendar</MotionLink><p className="loading" role="status">Loading the race weekend…</p></>;
  const bundle = data.bundle?.session.slug === slug ? data.bundle : null;
  const lapBundle = data.lapBundle?.session.slug === slug && (data.lapBundle.driver?.number === route.driver || data.lapBundle.driver === null && data.lapBundle.laps.status !== 'available') ? data.lapBundle : null;
  const polling = shouldPoll(weekend,{visible});
  return <>
    <MotionLink className="back-link" href="#calendar">← Race calendar</MotionLink><div className="page-heading weekend-heading"><div><p className="eyebrow"><span className="red-dot" /> THE RACE WEEKEND / ROUND {weekend.round}</p><h1 id="weekend-title" tabIndex="-1">{weekend.name}</h1><p className="weekend-location">{weekend.circuit} · {[weekend.location,weekend.country].filter(Boolean).join(', ')}</p></div><span className="season-pill">{weekend.season} SEASON</span></div>
    <div className="weekend-update"><span><i className={polling ? 'red-dot' : 'quiet-dot'} />{data.busy ? 'Checking published data…' : polling ? 'Checks for new published data every minute' : 'Published session data · Refresh to check for updates'}</span><span>Free data · {timezone.replaceAll('_',' ')}</span></div>
    <div className="weekend-tools"><SessionCountdown sessions={weekend.sessions} /><CalendarExport weekend={weekend} /></div>
    <CircuitMap weekend={weekend} timezone={timezone} />
    {(weekend.metadata.calendar.stale || weekend.metadata.timing.stale) && <Notice>Some weekend metadata is cached because its provider could not be refreshed.</Notice>}{data.error && <Notice onRetry={onRetry}>{data.error}</Notice>}
    <Tabs id={`sessions-${weekend.season}-${weekend.round}`} className="weekend-session-tabs" label="Weekend sessions" panelId="session-content" items={weekend.sessions.map(item => ({id:item.slug,name:item.name,cancelled:item.cancelled}))} selected={slug} onSelect={next => {location.hash = weekendHref(weekend.season,weekend.round,next);}} />
    <SessionPanel ready={!data.busy && Boolean(bundle)} bundle={bundle} lapBundle={lapBundle} weekend={weekend} session={session} selected={route.driver} timezone={timezone} onRetry={onRetry} />
  </>;
}
