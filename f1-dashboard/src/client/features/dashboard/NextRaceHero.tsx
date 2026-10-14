import type { DashboardState } from '../../app/types.js';

import { validateCalendar } from '../../../shared/contracts/jolpica.js';
import {
  displayDate,
  displaySession,
  nextRace,
  nextSession,
  sessions,
} from '../../../shared/domain/calendar.js';

import { SessionCountdown } from '../weekend/WeekendTools.js';
export function NextRaceHero({
  calendar,
  error,
  timezone,
  time,
}: {
  calendar: DashboardState['calendar'];
  error: string | null;
  timezone: string;
  time: number;
}) {
  if (!calendar)
    return (
      <section className="race-hero" aria-labelledby="next-title">
        <div id="next-race">
          <p className="eyebrow">UP NEXT</p>
          <h2 id="next-title">
            {error ? 'The calendar is unavailable.' : 'Finding the next Grand Prix…'}
          </h2>
          <p className="muted">
            {error
              ? 'Try refreshing to find the next Grand Prix.'
              : 'Loading the current season calendar.'}
          </p>
        </div>
        <div className="hero-decoration" aria-hidden="true">
          F1<span>RACE WEEKEND</span>
        </div>
      </section>
    );
  const races = validateCalendar(calendar.data).Races;
  const next = nextRace(races, time),
    upcomingSession = next && nextSession(next, time);
  return (
    <section className="race-hero" aria-labelledby="next-title">
      <div id="next-race">
        <p className="eyebrow">
          {next ? (
            <>
              UP NEXT <span aria-hidden="true">/</span> ROUND {next.round}
            </>
          ) : races.length ? (
            'CHEQUERED FLAG'
          ) : (
            'LOOKING AHEAD'
          )}
        </p>
        <h2 id="next-title">
          {next
            ? next.raceName
            : races.length
              ? 'The season calendar is complete.'
              : 'The calendar is not available yet.'}
        </h2>
        {next ? (
          <>
            <p className="race-location">
              {next.Circuit.circuitName}
              <span>·</span>
              {next.Circuit.Location?.locality}, {next.Circuit.Location?.country}
              <span>·</span>
              {displayDate(next, timezone, { month: 'long', day: 'numeric' })}
            </p>
            {upcomingSession && (
              <div className="next-session">
                <span className="session-label">NEXT SESSION</span>
                <strong>{upcomingSession.name}</strong>
                <span className="muted">{displaySession(upcomingSession, timezone)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            {races.length
              ? 'No upcoming Grands Prix are listed for this season.'
              : 'Check back when the next race schedule is published.'}
          </p>
        )}
        {next && <SessionCountdown compact sessions={sessions(next)} />}
      </div>
      <div className="hero-decoration" aria-hidden="true">
        F1<span>RACE WEEKEND</span>
      </div>
    </section>
  );
}
