import type { Lap } from '../contracts/results.js';

type LapSummary = Pick<Lap, 'lap' | 'duration'> & Partial<Pick<Lap, 'outLap' | 'pitLap'>>;
export function filteredLaps<T extends LapSummary>(
  laps: T[],
  filter: string,
  annotationsKnown = true,
) {
  if (filter === 'clean')
    return annotationsKnown
      ? laps.filter(
          (lap) =>
            lap.outLap === false &&
            lap.pitLap === false &&
            lap.duration !== null &&
            Number.isFinite(lap.duration) &&
            lap.duration > 0,
        )
      : [];
  if (filter === 'pit') return laps.filter((lap) => lap.pitLap === true);
  if (filter === 'out') return laps.filter((lap) => lap.outLap === true);
  return laps;
}
export function fastestLaps(laps: LapSummary[], annotationsKnown = true) {
  const clean = filteredLaps(laps, 'clean', annotationsKnown);
  if (!clean.length) return { numbers: new Set<number | null>(), duration: null };
  const duration = Math.min(...clean.map((lap) => lap.duration!));
  return {
    numbers: new Set(
      clean
        .filter((lap) => Math.round(lap.duration! * 1000) === Math.round(duration * 1000))
        .map((lap) => lap.lap),
    ),
    duration,
  };
}
