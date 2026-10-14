import { AnimatePresence } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../../shared/contracts/results.js';
import { parseWeekendRoute } from '../../shared/domain/weekend.js';
import { browserStorage } from '../api/cache-storage.js';
import { createDataClient } from '../api/dashboard-client.js';
import { createWeekendClient } from '../api/weekend-client.js';
import { MotionButton, MotionLink, PageReveal, RefreshIcon } from '../components/motion.js';
import { DashboardPage } from '../features/dashboard/DashboardPage.js';
import { useDashboardData } from '../features/dashboard/use-dashboard-data.js';
import { useWeekendData } from '../features/weekend/use-weekend-data.js';
import { WeekendPage } from '../features/weekend/WeekendPage.js';
import { useClock } from '../hooks/use-clock.js';
import { useHash } from '../hooks/use-hash.js';
import { useVisibility } from '../hooks/use-visibility.js';
import type { DashboardSelection } from './types.js';

export function App() {
  const hash = useHash();
  const route = useMemo(() => parseWeekendRoute(hash), [hash]);
  const visible = useVisibility();
  const [announcement, setAnnouncement] = useState('');
  const [selection, setSelection] = useState<DashboardSelection>({
    tab: 'drivers',
    season: null,
    openRounds: new Set(),
  });
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const clients = useMemo(() => {
    const storage = browserStorage();
    return { dashboard: createDataClient({ storage }), weekend: createWeekendClient({ storage }) };
  }, []);
  const dashboard = useDashboardData(clients.dashboard, !route, setAnnouncement);
  const weekend = useWeekendData(clients.weekend, route, hash, visible, setAnnouncement);
  const time = useClock(!route && visible);
  const busy = route ? weekend.busy : dashboard.busy;
  const dashboardScroll = useRef(0);
  const previous = useRef<{ route: Route; hash: string | null }>({ route: null, hash: null });
  useEffect(() => {
    document.body.dataset.appReady = 'true';
  }, []);
  useLayoutEffect(() => {
    const old = previous.current;
    if (route && !old.route) dashboardScroll.current = scrollY;
    if (
      route &&
      (!old.route || old.route.season !== route.season || old.route.round !== route.round)
    )
      window.scrollTo({ top: 0, behavior: 'instant' });
    if (!route && !old.route && hash !== old.hash)
      requestAnimationFrame(() => {
        if (hash === '#calendar' || hash === '#standings')
          document.querySelector(hash)?.scrollIntoView({ behavior: 'instant' });
      });
    previous.current = { route, hash };
  }, [route, hash]);
  useEffect(() => {
    const session =
      route &&
      weekend.weekend?.sessions.find(
        (item) => item.slug === (route.session || weekend.selectedSession),
      );
    document.title = session
      ? `${weekend.weekend!.name} · ${session.name} — Gridline`
      : 'Gridline — F1 Championship';
  }, [route, weekend.weekend, weekend.selectedSession]);
  function enteredDashboard() {
    if (location.hash === '#calendar' || location.hash === '#standings')
      document.querySelector(location.hash)?.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: dashboardScroll.current, behavior: 'instant' });
  }
  return (
    <>
      <a
        className="skip-link"
        href={route ? '#session-content' : '#standings'}
        onClick={(event) => {
          if (route) {
            event.preventDefault();
            const panel = document.querySelector<HTMLElement>('#session-content');
            panel?.focus();
            panel?.scrollIntoView();
          }
        }}
      >
        Skip to {route ? 'session results' : 'standings'}
      </a>
      <header className="topbar">
        <MotionLink href="#" className="brand" aria-label="Gridline home">
          <span className="brand-mark" aria-hidden="true">
            ///
          </span>{' '}
          GRIDLINE<span className="brand-sub">FORMULA 1</span>
        </MotionLink>
        <nav aria-label="Main navigation">
          <MotionLink href="#standings">Standings</MotionLink>
          <MotionLink href="#calendar">Race calendar</MotionLink>
        </nav>
        <MotionButton
          id="refresh"
          className="refresh"
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            if (route) void weekend.refresh(true);
            else void dashboard.refresh(true);
          }}
        >
          <RefreshIcon busy={busy} />
          {busy ? 'Refreshing' : 'Refresh'}
        </MotionButton>
      </header>
      <main>
        <AnimatePresence mode="wait">
          {route ? (
            <PageReveal
              key={`weekend-${route.season || 'invalid'}-${route.round || ''}`}
              id="weekend-view"
              data-ready-route={
                weekend.readyHash === location.hash && !weekend.busy ? location.hash : ''
              }
            >
              <WeekendPage route={route} data={weekend} timezone={timezone} visible={visible} />
            </PageReveal>
          ) : (
            <PageReveal key="dashboard" id="dashboard-view" onEntered={enteredDashboard}>
              <DashboardPage
                data={dashboard}
                selection={selection}
                setSelection={setSelection}
                timezone={timezone}
                time={time}
              />
            </PageReveal>
          )}
        </AnimatePresence>
        <p id="announcement" className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </main>
      <footer>
        <span className="footer-brand">
          GRIDLINE <span>/</span> A fan’s view of Formula 1.
        </span>
        <div className="footer-details">
          <nav className="rss-links" aria-label="RSS subscriptions">
            <span>RSS</span>
            <a href="/feeds/all.xml">All updates</a>
            <a href="/feeds/results.xml">Results</a>
            <a href="/feeds/upcoming.xml">24-hour reminders</a>
          </nav>
          <span>
            Data:{' '}
            <a
              href="https://github.com/jolpica/jolpica-f1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Jolpica F1
            </a>{' '}
            +{' '}
            <a href="https://openf1.org/" target="_blank" rel="noopener noreferrer">
              OpenF1
            </a>{' '}
            · Updates follow published session data.
          </span>
        </div>
      </footer>
    </>
  );
}
