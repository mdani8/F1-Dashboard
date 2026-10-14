import { motion } from 'motion/react';
import { useLayoutEffect } from 'react';
import { validateCalendar } from '../../../shared/contracts/jolpica.js';
import { nextRace } from '../../../shared/domain/calendar.js';
import type {
  DashboardSelection,
  DashboardState,
  Refresh,
  SetDashboardSelection,
} from '../../app/types.js';

import { CachedNotice, PanelHeading, Stamp } from '../../components/data-display.js';
import { MotionButton, ease, timings, useMotionPreference } from '../../components/motion.js';
import { Tabs } from '../../components/Tabs.js';

import { NextRaceHero } from './NextRaceHero.js';
import { StandingsTable } from './StandingsTable.js';
import { WeekendCalendarRow } from './WeekendCalendarRow.js';
export function DashboardPage({
  data,
  selection,
  setSelection,
  timezone,
  time,
}: {
  data: DashboardState & { refresh: Refresh };
  selection: DashboardSelection;
  setSelection: SetDashboardSelection;
  timezone: string;
  time: number;
}) {
  const reduced = useMotionPreference();
  const calendar = data.calendar && validateCalendar(data.calendar.data);
  const races = calendar
    ? [...calendar.Races].sort((a, b) => Number(a.round) - Number(b.round))
    : [];
  const next = nextRace(races, time);
  useLayoutEffect(() => {
    if (calendar && selection.season !== calendar.season)
      setSelection((previous) => ({
        ...previous,
        season: calendar.season,
        openRounds: new Set(next ? [next.round] : []),
      }));
  }, [calendar, next, selection.season, setSelection]);
  const onRetry = () => data.refresh(true);
  const onToggle = (round: string) =>
    setSelection((previous) => {
      const openRounds = new Set(previous.openRounds);
      if (openRounds.has(round)) openRounds.delete(round);
      else openRounds.add(round);
      return { ...previous, openRounds };
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="red-dot" /> THE CHAMPIONSHIP
          </p>
          <h1>Every point. Every weekend.</h1>
        </div>
        <span className="season-pill" id="season">
          {calendar ? `${calendar.season} SEASON` : 'CURRENT SEASON'}
        </span>
      </div>
      <NextRaceHero
        calendar={data.calendar}
        error={data.calendarError}
        timezone={timezone}
        time={time}
      />
      <p className="timezone" id="timezone">
        All times in {timezone.replaceAll('_', ' ')} · 24-hour clock
      </p>
      <div className="dashboard-grid">
        <section id="standings" className="panel" aria-labelledby="standings-title">
          <PanelHeading
            eyebrow="THE POINTS THAT MATTER"
            title="Championship standings"
            id="standings-title"
            number="01"
          />
          <Tabs
            id="standings-tabs"
            className="tabs"
            label="Championship"
            items={[
              { id: 'drivers', name: 'Drivers' },
              { id: 'constructors', name: 'Constructors' },
            ]}
            selected={selection.tab}
            onSelect={(tab) => setSelection((previous) => ({ ...previous, tab }))}
          />
          {(['drivers', 'constructors'] as const).map((type) => (
            <div
              key={type}
              id={`${type}-panel`}
              role="tabpanel"
              aria-labelledby={`${type}-tab`}
              tabIndex={0}
              hidden={selection.tab !== type}
            >
              <motion.div
                initial={false}
                animate={{ opacity: selection.tab === type ? 1 : 0 }}
                transition={{ duration: reduced ? 0.1 : timings.tab, ease }}
              >
                <StandingsTable
                  type={type}
                  season={calendar?.season}
                  result={data[type]}
                  error={data[type === 'drivers' ? 'driversError' : 'constructorsError']}
                  timezone={timezone}
                  onRetry={onRetry}
                />
              </motion.div>
            </div>
          ))}
        </section>
        <section id="calendar" className="panel calendar-panel" aria-labelledby="calendar-title">
          <PanelHeading
            eyebrow="LIGHTS OUT, AROUND THE WORLD"
            title="Race calendar"
            id="calendar-title"
            number="02"
          />
          <div className="calendar-key">
            <span>
              <i className="red-dot" /> Upcoming
            </span>
            <span>Open results or expand the weekend schedule</span>
          </div>
          <div id="calendar-content">
            {calendar ? (
              <>
                <CachedNotice section={data.calendar} onRetry={onRetry} />
                <p className="data-note">
                  {races.length} race weekends ·{' '}
                  <Stamp at={data.calendar!.at} timezone={timezone} />
                </p>
                {races.length ? (
                  <div className="calendar-list">
                    {races.map((race) => (
                      <WeekendCalendarRow
                        key={`${calendar.season}:${race.round}`}
                        race={race}
                        season={calendar.season}
                        timezone={timezone}
                        time={time}
                        isNext={race.round === next?.round}
                        open={selection.openRounds.has(race.round)}
                        onToggle={onToggle}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="message">No race weekends have been published yet.</p>
                )}
              </>
            ) : data.calendarError ? (
              <p className="message" role="status">
                {data.calendarError}{' '}
                <MotionButton className="retry" onClick={onRetry}>
                  Retry
                </MotionButton>
              </p>
            ) : (
              <p className="loading">Loading race weekends…</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
