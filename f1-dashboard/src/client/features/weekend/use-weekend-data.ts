import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { errorMessage } from '../../../shared/contracts/guards.js';
import type { Route } from '../../../shared/contracts/results.js';
import type { WeekendClient } from '../../api/weekend-client.js';
import type { WeekendState } from '../../app/types.js';

import {
  validateLaps,
  validateSession,
  validateWeekend,
} from '../../../shared/contracts/validation.js';
import {
  defaultSession,
  REFRESH_INTERVAL,
  resultTTL,
  shouldPoll,
  weekendHref,
} from '../../../shared/domain/weekend.js';
const initialWeekend: WeekendState = {
  weekend: null,
  bundle: null,
  lapBundle: null,
  selectedSession: null,
  busy: false,
  error: null,
  readyHash: null,
};

export function useWeekendData(
  client: WeekendClient,
  route: Route,
  hash: string,
  visible: boolean,
  announce: (message: string) => void,
) {
  const [state, setState] = useState(initialWeekend);
  const latest = useRef(state);
  const version = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const scroll = useRef<{ hash: string; x: number; y: number; focused: Element | null } | null>(
    null,
  );
  const commit = useCallback((patch: Partial<WeekendState>, preserve = false) => {
    if (preserve)
      scroll.current = {
        hash: location.hash,
        x: scrollX,
        y: scrollY,
        focused: document.activeElement,
      };
    latest.current = { ...latest.current, ...patch };
    setState(latest.current);
  }, []);
  useLayoutEffect(() => {
    const saved = scroll.current;
    scroll.current = null;
    if (!saved || saved.hash !== location.hash) return;
    if (saved.focused instanceof HTMLElement && saved.focused.isConnected)
      saved.focused.focus({ preventScroll: true });
    window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
  }, [state]);
  const refresh = useCallback(
    async (force = false) => {
      if (!route || route.invalid || busy.current) return;
      const current = ++version.current;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const signal = controller.signal;
      const valid = () => version.current === current && !signal.aborted;
      busy.current = true;
      commit({ busy: true, error: null, readyHash: null });
      const base = `/api/weekends/${route.season}/${route.round}`;
      try {
        const metadata = await client.load(base, { force, signal, validate: validateWeekend });
        if (!valid()) return;
        const slug =
          route.session || latest.current.selectedSession || defaultSession(metadata.sessions);
        if (!metadata.sessions.some((session) => session.slug === slug))
          throw new Error('This session is not part of the published weekend.');
        if (!route.session)
          history.replaceState(
            null,
            '',
            weekendHref(route.season, route.round, slug, route.driver),
          );
        commit({ weekend: metadata, selectedSession: slug }, true);
        const sessionPath = base + '/sessions/' + slug;
        const bundle = await client.load(sessionPath, {
          ttl: resultTTL(metadata),
          force,
          signal,
          validate: validateSession,
        });
        if (!valid()) return;
        commit({ bundle, weekend: bundle.weekend || metadata }, true);
        if (route.driver !== null) {
          try {
            const lapBundle = await client.load(sessionPath + '/laps?driver=' + route.driver, {
              ttl: resultTTL(bundle.weekend || metadata),
              force,
              signal,
              validate: validateLaps,
            });
            if (!valid()) return;
            commit({ lapBundle }, true);
          } catch (error) {
            if (!valid()) return;
            commit(
              {
                lapBundle: {
                  session: bundle.session,
                  driver: { number: route.driver, name: 'Selected driver' },
                  laps: {
                    status: 'failed',
                    source: 'OpenF1',
                    at: null,
                    data: [],
                    stale: false,
                    message: errorMessage(error),
                  },
                },
              },
              true,
            );
          }
        }
        if (valid()) announce('Published session data checked.');
      } catch (error) {
        if (valid()) {
          commit({ error: errorMessage(error) }, true);
          announce('Some session data could not be loaded.');
        }
      } finally {
        if (valid()) {
          busy.current = false;
          commit({ busy: false, readyHash: location.hash }, true);
        }
      }
    },
    [route, client, commit, announce],
  );

  useEffect(() => {
    version.current += 1;
    request.current?.abort();
    busy.current = false;
    if (!route) return;
    if (route.invalid) {
      commit({
        ...initialWeekend,
        error: 'This results link is invalid.',
        readyHash: location.hash,
      });
      return;
    }
    const previous = latest.current;
    const sameWeekend =
      previous.weekend?.season === route.season && previous.weekend?.round === route.round;
    const slug = route.session || (sameWeekend ? previous.selectedSession : null);
    const sameSession = sameWeekend && previous.bundle?.session?.slug === slug;
    commit({
      weekend: sameWeekend ? previous.weekend : null,
      selectedSession: slug,
      bundle: sameSession ? previous.bundle : null,
      lapBundle:
        sameSession && previous.lapBundle?.driver?.number === route.driver
          ? previous.lapBundle
          : null,
      error: null,
      readyHash: null,
    });
    void refresh();
    return () => {
      version.current += 1;
      request.current?.abort();
      busy.current = false;
    };
  }, [hash, route, refresh, commit]);

  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current && route && latest.current.weekend) void refresh();
    wasVisible.current = visible;
    if (!visible || !route || route.invalid) return;
    const timer = setInterval(() => {
      if (shouldPoll(latest.current.weekend, { visible: !document.hidden })) void refresh();
    }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [visible, route, refresh]);
  return {
    ...state,
    busy: state.busy || Boolean(route && !route.invalid && state.readyHash !== location.hash),
    refresh,
  };
}
