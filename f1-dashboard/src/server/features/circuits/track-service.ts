import { errorMessage } from '../../../shared/contracts/guards.js';
import type { LocationRow } from '../../../shared/contracts/providers.js';
import type { Clock, Weekend } from '../../../shared/contracts/results.js';
import type { TrackResponse } from '../../../shared/contracts/track.js';
import type { Upstream } from '../../providers/upstream.js';
import { ProviderError } from '../../providers/upstream.js';
import { validArray, validSessions, validTiming } from '../../providers/validation.js';
const validLocations: (data: unknown) => asserts data is LocationRow[] = validArray;

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GeographicReference } from '../../../shared/contracts/track.js';
import {
  buildTrackGeometry,
  matchCircuit,
  referenceLaps,
  referenceSessions,
} from '../../../shared/domain/track-geometry.js';
import { orientTrackNorth } from '../../../shared/domain/track-orientation.js';
import { projectRoot } from '../../config/paths.js';
const geography = JSON.parse(
  readFileSync(path.join(projectRoot, 'data/circuit-geography.json'), 'utf8'),
) as { circuits: Record<string, GeographicReference> };

const TTL = 86400000;

export function createTrackService({
  upstream,
  getWeekend,
  now = Date.now,
}: {
  upstream: Upstream;
  getWeekend: (season: string | number, round: string | number) => Promise<Weekend>;
  now?: Clock;
}) {
  const cache = new Map<string, TrackResponse>(),
    pending = new Map<string, Promise<TrackResponse>>();
  async function getTrack(
    season: string | number,
    round: string | number,
    force = false,
  ): Promise<TrackResponse> {
    const weekend = await getWeekend(season, round);
    const key = `${season}:${round}:${weekend.circuitId}`;
    const previous = cache.get(key);
    if (pending.has(key)) return pending.get(key)!;
    if (!force && previous && now() - (previous.at ?? 0) < TTL) return previous;
    const request = (async (): Promise<TrackResponse> => {
      let failure: ProviderError | null = null;
      try {
        // Prefer this season, then a clearly labelled earlier reference for future weekends.
        for (const year of [Number(season), Number(season) - 1].filter((year) => year >= 2023)) {
          const sessions = await upstream.load('openf1', `sessions?year=${year}`, {
            validate: validSessions,
          });
          const circuitKey = matchCircuit(weekend, sessions.data);
          if (circuitKey === null) continue;
          const candidates = referenceSessions(
            sessions.data.filter((row) => String(row.year) === String(year)),
            circuitKey,
            now(),
          );
          // Bound attempts so unavailable geometry does not consume the results request budget.
          for (const session of candidates.slice(0, 1)) {
            try {
              const lapData = await upstream.load(
                'openf1',
                `laps?session_key=${session.session_key}`,
                { ttl: TTL, force, validate: validTiming },
              );
              const laps = referenceLaps(lapData.data, now());
              if (!laps.length) continue;
              const lap = laps[0]!;
              const start = new Date(lap.date_start).toISOString(),
                end = new Date(Date.parse(lap.date_start) + lap.lap_duration * 1000).toISOString();
              const positions = await upstream.load<LocationRow[]>(
                'openf1',
                `location?session_key=${session.session_key}&driver_number=${lap.driver_number}&date>=${start}&date<=${end}`,
                { ttl: TTL, force, validate: validLocations },
              );
              const geometry = buildTrackGeometry(lap, positions.data, session.session_key);
              if (!geometry) continue;
              let driver = { number: lap.driver_number, name: `Driver ${lap.driver_number}` };
              try {
                const roster = await upstream.load(
                  'openf1',
                  `drivers?session_key=${session.session_key}`,
                  { ttl: TTL, validate: validTiming },
                );
                const matched = roster.data.find((row) => row.driver_number === lap.driver_number);
                if (matched)
                  driver = { number: lap.driver_number, name: matched.full_name || driver.name };
              } catch {
                /* Geometry remains useful when the reference driver's name is unavailable. */
              }
              const result: TrackResponse = {
                status: 'available',
                circuitId: weekend.circuitId,
                circuitName: weekend.circuit,
                source: 'OpenF1',
                at: positions.at,
                stale: Boolean(positions.stale || lapData.stale || sessions.stale),
                geometry: orientTrackNorth(geometry, geography.circuits[weekend.circuitId]),
                reference: {
                  season: String(year),
                  session: session.session_name,
                  sessionKey: session.session_key,
                  driver,
                  lap: lap.lap_number,
                  duration: lap.lap_duration,
                },
              };
              cache.set(key, result);
              if (cache.size > 60) cache.delete(cache.keys().next().value!);
              return result;
            } catch (error) {
              failure =
                error instanceof ProviderError ? error : new ProviderError(errorMessage(error));
            }
          }
        }
      } catch (error) {
        failure = error instanceof ProviderError ? error : new ProviderError(errorMessage(error));
      }
      if (previous)
        return {
          ...previous,
          stale: true,
          message: 'Could not refresh the track map. Showing the previous reference lap.',
        };
      return {
        status: failure && ![401, 403, 404].includes(failure.status) ? 'failed' : 'awaiting',
        circuitId: weekend.circuitId,
        circuitName: weekend.circuit,
        source: 'OpenF1',
        at: null,
        stale: false,
        geometry: null,
        reference: null,
        message:
          failure?.message ||
          'A complete published reference lap with position data is not available yet.',
      };
    })().finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  return { getTrack };
}
