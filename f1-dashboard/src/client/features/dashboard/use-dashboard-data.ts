import { useCallback, useEffect, useRef, useState } from 'react';
import { validateCalendar, validateStandings } from '../../../shared/contracts/jolpica.js';
import type { CalendarPayload, StandingsPayload } from '../../../shared/contracts/providers.js';
import type { DashboardClient } from '../../api/dashboard-client.js';
import type { DashboardState } from '../../app/types.js';

export function useDashboardData(
  client: DashboardClient,
  enabled: boolean,
  announce: (message: string) => void,
) {
  const [state, setState] = useState<DashboardState>({
    calendar: null,
    drivers: null,
    constructors: null,
    calendarError: null,
    driversError: null,
    constructorsError: null,
    busy: false,
  });
  const latest = useRef(state);
  const busy = useRef(false);
  const mounted = useRef(true);
  const commit = useCallback((patch: Partial<DashboardState>) => {
    if (!mounted.current) return;
    latest.current = { ...latest.current, ...patch };
    setState(latest.current);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(
    async (force = false) => {
      if (busy.current) return;
      busy.current = true;
      commit({ busy: true });
      announce('Refreshing championship data.');
      let errors = 0;
      try {
        let calendar;
        try {
          calendar = await client.load<CalendarPayload>(
            `calendar:${new Date().getUTCFullYear()}`,
            'current/races/',
            validateCalendar,
            force,
          );
        } catch {
          errors++;
          if (!latest.current.calendar) {
            commit({
              calendarError: 'Could not load the current season calendar.',
              driversError: 'Standings need the current season calendar.',
              constructorsError: 'Standings need the current season calendar.',
            });
            return;
          }
          calendar = { ...latest.current.calendar, stale: true };
        }
        commit({ calendar, calendarError: null });
        if (calendar.stale) errors++;
        const season = validateCalendar(calendar.data).season;
        await Promise.all(
          (['drivers', 'constructors'] as const).map(async (kind) => {
            try {
              const result = await client.load<StandingsPayload>(
                `${season}:${kind}`,
                `${season}/${kind === 'drivers' ? 'driverstandings' : 'constructorstandings'}/`,
                (data) =>
                  validateStandings(
                    data,
                    season,
                    kind === 'drivers' ? 'DriverStandings' : 'ConstructorStandings',
                  ),
                force,
              );
              commit({ [kind]: result, [kind + 'Error']: null });
              if (result.stale) errors++;
            } catch {
              errors++;
              const previous = latest.current[kind];
              commit(
                previous
                  ? { [kind]: { ...previous, stale: true } }
                  : {
                      [kind + 'Error']:
                        `Could not load ${kind === 'drivers' ? 'driver' : 'constructor'} standings.`,
                    },
              );
            }
          }),
        );
      } finally {
        busy.current = false;
        commit({ busy: false });
        announce(
          errors
            ? 'Some championship data is unavailable or out of date.'
            : 'Championship data updated.',
        );
      }
    },
    [client, commit, announce],
  );
  useEffect(() => {
    if (enabled && !latest.current.calendar) void refresh();
  }, [enabled, refresh]);
  return {
    ...state,
    busy: state.busy || (enabled && !state.calendar && !state.calendarError),
    refresh,
  };
}
