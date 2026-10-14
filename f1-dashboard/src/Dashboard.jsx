import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { validateCalendar, validateStandings, nextRace, nextSession, sessions, isUpcoming, displayDate, displaySession } from '../shared/data.js';
import { weekendHref } from '../shared/weekend-model.js';
import { ChangedCell, MotionButton, MotionLink, ease, timings, useMotionPreference } from './motion.jsx';
import { CachedNotice, PanelHeading, Stamp, Tabs, teamColors, dash } from './ui.jsx';
import { FavouriteButton, useFavourites } from './Favourites.jsx';
import { SessionCountdown } from './WeekendTools.jsx';

function Hero({calendar,error,timezone,time}) {
  if (!calendar) return <section className="race-hero" aria-labelledby="next-title"><div id="next-race"><p className="eyebrow">UP NEXT</p><h2 id="next-title">{error ? 'The calendar is unavailable.' : 'Finding the next Grand Prix…'}</h2><p className="muted">{error ? 'Try refreshing to find the next Grand Prix.' : 'Loading the current season calendar.'}</p></div><div className="hero-decoration" aria-hidden="true">F1<span>RACE WEEKEND</span></div></section>;
  const races = validateCalendar(calendar.data).Races;
  const next = nextRace(races,time), upcomingSession = next && nextSession(next,time);
  return <section className="race-hero" aria-labelledby="next-title"><div id="next-race">
    <p className="eyebrow">{next ? <>UP NEXT <span aria-hidden="true">/</span> ROUND {next.round}</> : races.length ? 'CHEQUERED FLAG' : 'LOOKING AHEAD'}</p>
    <h2 id="next-title">{next ? next.raceName : races.length ? 'The season calendar is complete.' : 'The calendar is not available yet.'}</h2>
    {next ? <><p className="race-location">{next.Circuit.circuitName}<span>·</span>{next.Circuit.Location?.locality}, {next.Circuit.Location?.country}<span>·</span>{displayDate(next,timezone,{month:'long',day:'numeric'})}</p>{upcomingSession && <div className="next-session"><span className="session-label">NEXT SESSION</span><strong>{upcomingSession.name}</strong><span className="muted">{displaySession(upcomingSession,timezone)}</span></div>}</> : <p className="muted">{races.length ? 'No upcoming Grands Prix are listed for this season.' : 'Check back when the next race schedule is published.'}</p>}
    {next && <SessionCountdown compact sessions={sessions(next)} />}
  </div><div className="hero-decoration" aria-hidden="true">F1<span>RACE WEEKEND</span></div></section>;
}

function StandingsTable({result,error,season,type,timezone,onRetry}) {
  const favourites = useFavourites();
  if (error && !result) return <p className="message" role="status">{error} <MotionButton className="retry" onClick={onRetry}>Retry</MotionButton></p>;
  if (!result || result.data?.MRData?.StandingsTable?.season !== season) return <p className="loading">Loading {type === 'drivers' ? 'driver' : 'constructor'} standings…</p>;
  const drivers = type === 'drivers';
  const list = validateStandings(result.data,season,drivers ? 'DriverStandings' : 'ConstructorStandings');
  const rows = list?.[drivers ? 'DriverStandings' : 'ConstructorStandings'] || [];
  return <><CachedNotice section={result} onRetry={onRetry} /><p className="data-note"><strong>{season} {list ? `· After round ${list.round}` : '· Season standings'}</strong><br /><Stamp at={result.at} timezone={timezone} /></p>{rows.length ? <div className="table-wrap" tabIndex="0" role="region" aria-label="Scrollable championship standings"><table aria-label={`${drivers ? 'Driver' : 'Constructor'} championship standings`}><thead><tr>{['POS',drivers ? 'DRIVER / TEAM' : 'CONSTRUCTOR','PTS','WINS'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => {
    const teams = drivers ? row.Constructors || [] : [row.Constructor];
    const team = teams[0];
    const name = drivers ? `${row.Driver?.givenName || ''} ${row.Driver?.familyName || ''}`.trim() : row.Constructor?.name;
    const key = drivers ? row.Driver?.driverId || row.Driver?.code || name : row.Constructor?.constructorId || name;
    const favourite = drivers && favourites.isDriver(row.Driver) || teams.some(item => favourites.isTeam(item));
    return <tr key={key} className={favourite ? 'favourite-row' : undefined} data-favourite={favourite ? 'true' : undefined}><ChangedCell className="position" value={row.positionText || row.position}>{row.positionText || row.position || '—'}</ChangedCell><td><div className="entrant"><span className="team-stripe" style={{'--team-color':teamColors[team?.constructorId] || '#a4a8b4'}} aria-hidden="true" /><div className="entrant-details"><div className="entrant-primary"><span className="entrant-name">{name || 'Unknown entrant'}</span><FavouriteButton kind={drivers ? 'drivers' : 'teams'} value={drivers ? row.Driver : row.Constructor} name={name || 'Unknown entrant'} /></div>{drivers && <div className="entrant-secondary"><span className="entrant-team">{teams.map(item => item.name).join(' / ')}</span><FavouriteButton kind="teams" value={team} name={team?.name || 'Team'} /></div>}</div></div></td><ChangedCell className="points" value={row.points}>{dash(row.points)}</ChangedCell><ChangedCell className="wins" value={row.wins}>{dash(row.wins)}</ChangedCell></tr>;
  })}</tbody></table></div> : <p className="message">No championship standings have been published for this season yet.</p>}</>;
}

function RaceRow({race,season,open,onToggle,isNext,timezone,time}) {
  const body = useRef(null), toggle = useRef(null);
  const reduced = useMotionPreference();
  const [closed,setClosed] = useState(!open);
  useLayoutEffect(() => {if (open) setClosed(false);},[open]);
  const upcoming = isUpcoming(race,time);
  const scheduleId = `schedule-${season}-${race.round}`;
  function toggleSchedule() {
    if (open && body.current?.contains(document.activeElement)) toggle.current?.focus({preventScroll:true});
    onToggle(race.round);
  }
  return <article className={`race-row ${upcoming ? 'upcoming' : 'past'} ${isNext ? 'next' : ''} ${open ? 'is-open' : ''}`} data-round={race.round}>
    <div className="race-row-heading"><MotionLink className="race-open" href={weekendHref(season,race.round)} aria-label={`${race.raceName} results`}>
      <span className="race-round">{String(race.round).padStart(2,'0')}</span><span className="race-date">{displayDate(race,timezone,{day:'2-digit'})}<span>{displayDate(race,timezone,{month:'short'}).toUpperCase()}</span></span><div className="race-info"><h3>{race.raceName}</h3><p>{race.Circuit.circuitName}</p></div><span className="race-status">{isNext ? 'NEXT UP' : upcoming ? 'UPCOMING' : 'PAST'}</span>
    </MotionLink><MotionButton ref={toggle} className="schedule-toggle" data-schedule={scheduleId} aria-label={`${race.raceName} schedule`} aria-expanded={open} aria-controls={scheduleId} onClick={toggleSchedule}><motion.span className="chevron" aria-hidden="true" animate={{rotate:open ? 90 : 0}} transition={{duration:reduced ? 0 : timings.disclosure,ease}}>›</motion.span></MotionButton></div>
    <motion.div ref={body} className="schedule-reveal" hidden={closed && !open} inert={open ? undefined : true} aria-hidden={open ? undefined : true} initial={false}
      animate={{height:open ? 'auto' : 0,opacity:open ? 1 : 0}} transition={{duration:reduced ? 0 : timings.disclosure,ease}} onAnimationComplete={() => {if (!open) setClosed(true);}}>
      <ul className="sessions" id={scheduleId}>{sessions(race).map(session => <li key={session.slug} className={session.slug === 'race' ? 'race-session' : ''}><MotionLink href={weekendHref(season,race.round,session.slug)}>{session.name} <span aria-hidden="true">↗</span></MotionLink><span>{displaySession(session,timezone)}</span></li>)}</ul>
    </motion.div>
  </article>;
}

export function Dashboard({data,selection,setSelection,timezone,time}) {
  const reduced = useMotionPreference();
  const calendar = data.calendar && validateCalendar(data.calendar.data);
  const races = calendar ? [...calendar.Races].sort((a,b) => Number(a.round) - Number(b.round)) : [];
  const next = nextRace(races,time);
  useLayoutEffect(() => {
    if (calendar && selection.season !== calendar.season) setSelection(previous => ({...previous,season:calendar.season,openRounds:new Set(next ? [next.round] : [])}));
  },[calendar?.season,selection.season,next?.round,setSelection]);
  const onRetry = () => data.refresh(true);
  const onToggle = round => setSelection(previous => {const openRounds = new Set(previous.openRounds);if (openRounds.has(round)) openRounds.delete(round);else openRounds.add(round);return {...previous,openRounds};});
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="red-dot" /> THE CHAMPIONSHIP</p><h1>Every point. Every weekend.</h1></div><span className="season-pill" id="season">{calendar ? `${calendar.season} SEASON` : 'CURRENT SEASON'}</span></div>
    <Hero calendar={data.calendar} error={data.calendarError} timezone={timezone} time={time} /><p className="timezone" id="timezone">All times in {timezone.replaceAll('_',' ')} · 24-hour clock</p>
    <div className="dashboard-grid"><section id="standings" className="panel" aria-labelledby="standings-title">
      <PanelHeading eyebrow="THE POINTS THAT MATTER" title="Championship standings" id="standings-title" number="01" />
      <Tabs id="standings-tabs" className="tabs" label="Championship" items={[{id:'drivers',name:'Drivers'},{id:'constructors',name:'Constructors'}]} selected={selection.tab} onSelect={tab => setSelection(previous => ({...previous,tab}))} />
      {['drivers','constructors'].map(type => <div key={type} id={`${type}-panel`} role="tabpanel" aria-labelledby={`${type}-tab`} tabIndex="0" hidden={selection.tab !== type}><motion.div initial={false} animate={{opacity:selection.tab === type ? 1 : 0}} transition={{duration:reduced ? .1 : timings.tab,ease}}><StandingsTable type={type} season={calendar?.season} result={data[type]} error={data[type + 'Error']} timezone={timezone} onRetry={onRetry} /></motion.div></div>)}
    </section><section id="calendar" className="panel calendar-panel" aria-labelledby="calendar-title">
      <PanelHeading eyebrow="LIGHTS OUT, AROUND THE WORLD" title="Race calendar" id="calendar-title" number="02" /><div className="calendar-key"><span><i className="red-dot" /> Upcoming</span><span>Open results or expand the weekend schedule</span></div>
      <div id="calendar-content">{calendar ? <><CachedNotice section={data.calendar} onRetry={onRetry} /><p className="data-note">{races.length} race weekends · <Stamp at={data.calendar.at} timezone={timezone} /></p>{races.length ? <div className="calendar-list">{races.map(race => <RaceRow key={`${calendar.season}:${race.round}`} race={race} season={calendar.season} timezone={timezone} time={time} isNext={race.round === next?.round} open={selection.openRounds.has(race.round)} onToggle={onToggle} />)}</div> : <p className="message">No race weekends have been published yet.</p>}</> : data.calendarError ? <p className="message" role="status">{data.calendarError} <MotionButton className="retry" onClick={onRetry}>Retry</MotionButton></p> : <p className="loading">Loading race weekends…</p>}</div>
    </section></div>
  </>;
}
