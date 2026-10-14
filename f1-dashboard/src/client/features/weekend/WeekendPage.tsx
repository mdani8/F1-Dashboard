import type { Route } from '../../../shared/contracts/results.js';
import type { Refresh, WeekendState } from '../../app/types.js';

import { shouldPoll, weekendHref } from '../../../shared/domain/weekend.js';
import { Notice } from '../../components/data-display.js';
import { MotionLink } from '../../components/motion.js';
import { Tabs } from '../../components/Tabs.js';
import { CircuitMap } from '../circuit/CircuitMap.js';

import { CalendarExport, SessionCountdown } from './WeekendTools.js';

import { SessionPanel } from './SessionPanel.js';
export function WeekendPage({
  route,
  data,
  timezone,
  visible,
}: {
  route: NonNullable<Route>;
  data: WeekendState & { refresh: Refresh };
  timezone: string;
  visible: boolean;
}) {
  const onRetry = () => data.refresh(true);
  const sameWeekend = data.weekend?.season === route.season && data.weekend?.round === route.round;
  const weekend = sameWeekend ? data.weekend : null;
  const slug = route.session || data.selectedSession;
  const session = weekend?.sessions.find((item) => item.slug === slug);
  if (route.invalid || (data.error && !session))
    return (
      <>
        <MotionLink className="back-link" href="#calendar">
          ← Race calendar
        </MotionLink>
        <div className="panel">
          <h1 className="error-title">Weekend unavailable</h1>
          <p className="message" role="status">
            {route.invalid ? 'This results link is invalid.' : data.error}
          </p>
          {!route.invalid && (
            <div className="error-actions">
              <button className="retry" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
        </div>
      </>
    );
  if (!session || !weekend)
    return (
      <>
        <MotionLink className="back-link" href="#calendar">
          ← Race calendar
        </MotionLink>
        <p className="loading" role="status">
          Loading the race weekend…
        </p>
      </>
    );
  const bundle = data.bundle?.session.slug === slug ? data.bundle : null;
  const lapBundle =
    data.lapBundle?.session.slug === slug &&
    (data.lapBundle.driver?.number === route.driver ||
      (data.lapBundle.driver === null && data.lapBundle.laps.status !== 'available'))
      ? data.lapBundle
      : null;
  const polling = shouldPoll(weekend, { visible });
  return (
    <>
      <MotionLink className="back-link" href="#calendar">
        ← Race calendar
      </MotionLink>
      <div className="page-heading weekend-heading">
        <div>
          <p className="eyebrow">
            <span className="red-dot" /> THE RACE WEEKEND / ROUND {weekend.round}
          </p>
          <h1 id="weekend-title" tabIndex={-1}>
            {weekend.name}
          </h1>
          <p className="weekend-location">
            {weekend.circuit} · {[weekend.location, weekend.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <span className="season-pill">{weekend.season} SEASON</span>
      </div>
      <div className="weekend-update">
        <span>
          <i className={polling ? 'red-dot' : 'quiet-dot'} />
          {data.busy
            ? 'Checking published data…'
            : polling
              ? 'Checks for new published data every minute'
              : 'Published session data · Refresh to check for updates'}
        </span>
        <span>Free data · {timezone.replaceAll('_', ' ')}</span>
      </div>
      <div className="weekend-tools">
        <SessionCountdown sessions={weekend.sessions} />
        <CalendarExport weekend={weekend} />
      </div>
      <CircuitMap weekend={weekend} timezone={timezone} />
      {(weekend.metadata.calendar.stale || weekend.metadata.timing.stale) && (
        <Notice>
          Some weekend metadata is cached because its provider could not be refreshed.
        </Notice>
      )}
      {data.error && <Notice onRetry={onRetry}>{data.error}</Notice>}
      <Tabs
        id={`sessions-${weekend.season}-${weekend.round}`}
        className="weekend-session-tabs"
        label="Weekend sessions"
        panelId="session-content"
        items={weekend.sessions.map((item) => ({
          id: item.slug,
          name: item.name,
          cancelled: item.cancelled,
        }))}
        selected={slug}
        onSelect={(next) => {
          location.hash = weekendHref(weekend.season, weekend.round, next);
        }}
      />
      <SessionPanel
        ready={!data.busy && Boolean(bundle)}
        bundle={bundle}
        lapBundle={lapBundle}
        weekend={weekend}
        session={session}
        selected={route.driver}
        timezone={timezone}
        onRetry={onRetry}
      />
    </>
  );
}
