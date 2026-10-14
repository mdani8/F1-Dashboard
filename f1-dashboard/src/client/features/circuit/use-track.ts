import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Weekend } from '../../../shared/contracts/results.js';
import type { TrackResponse } from '../../../shared/contracts/track.js';
import { browserStorage } from '../../api/cache-storage.js';

import { createWeekendClient } from '../../api/weekend-client.js';

import { validateTrack } from '../../../shared/domain/track-geometry.js';

export function useTrack(weekend: Weekend) {
  const client = useMemo(() => createWeekendClient({ storage: browserStorage() }), []);
  const [state, setState] = useState<{
    data: TrackResponse | null;
    busy: boolean;
    error: string | null;
  }>({ data: null, busy: true, error: null });
  const request = useRef<AbortController | null>(null),
    version = useRef(0);
  const load = useCallback(
    async (force = false) => {
      const current = ++version.current;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setState((previous) => ({ ...previous, busy: true, error: null }));
      try {
        const data = await client.load(`/api/weekends/${weekend.season}/${weekend.round}/track`, {
          ttl: 900000,
          force,
          signal: controller.signal,
          validate: (value: unknown): asserts value is TrackResponse => {
            validateTrack(value);
            if (weekend.circuitId && value.circuitId !== weekend.circuitId)
              throw new Error('The reference map belongs to a different circuit.');
          },
        });
        if (current === version.current && !controller.signal.aborted)
          setState({ data, busy: false, error: null });
      } catch {
        if (current === version.current && !controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            busy: false,
            error: 'Could not load the track map.',
          }));
      }
    },
    [client, weekend.season, weekend.round, weekend.circuitId],
  );
  useEffect(() => {
    setState({ data: null, busy: true, error: null });
    void load();
    return () => {
      version.current += 1;
      request.current?.abort();
    };
  }, [load]);
  return { ...state, refresh: () => load(true) };
}
