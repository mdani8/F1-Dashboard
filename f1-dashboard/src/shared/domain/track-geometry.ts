import { finiteNumber as finite, isRecord } from '../contracts/guards.js';
import type { LocationRow, OpenSession, OpenTiming, ReferenceLap } from '../contracts/providers.js';
import type { Weekend } from '../contracts/results.js';
import type { Point, TrackGeometry, TrackResponse } from '../contracts/track.js';
import { countryKey, nameKey } from './identity.js';
interface TimedPoint {
  t: number;
  x: number;
  y: number;
}

export function matchCircuit(
  weekend: Pick<Weekend, 'location' | 'circuit' | 'country'>,
  sessions: OpenSession[],
) {
  const locality = nameKey(weekend.location);
  const circuit = nameKey(weekend.circuit).replace(/grandprix|international|circuit/g, '');
  const matches = sessions.filter((row) => {
    const remote = nameKey(row.circuit_short_name).replace(/grandprix|international|circuit/g, '');
    return (
      Number.isInteger(row.circuit_key) &&
      row.circuit_key > 0 &&
      countryKey(weekend.country) === countryKey(row.country_name) &&
      ((locality && locality === nameKey(row.location)) ||
        (circuit && remote && (circuit.includes(remote) || remote.includes(circuit))))
    );
  });
  const keys = [...new Set(matches.map((row) => row.circuit_key))];
  return keys.length === 1 ? keys[0]! : null;
}

export function referenceSessions(entries: OpenSession[], circuitKey: number, now: number) {
  const priority = (name: string) =>
    name === 'Qualifying' ? 0 : name.startsWith('Practice') ? 1 : name === 'Race' ? 2 : 3;
  return entries
    .filter(
      (row) =>
        row.circuit_key === circuitKey &&
        !row.is_cancelled &&
        Number.isInteger(row.session_key) &&
        Number.isFinite(Date.parse(row.date_end)) &&
        Date.parse(row.date_end) < now,
    )
    .sort(
      (a, b) =>
        priority(a.session_name || '') - priority(b.session_name || '') ||
        Date.parse(b.date_start) - Date.parse(a.date_start),
    );
}

export function referenceLaps(rows: OpenTiming[], now: number): ReferenceLap[] {
  return rows
    .filter((row): row is ReferenceLap => {
      const sectors = [row.duration_sector_1, row.duration_sector_2, row.duration_sector_3];
      if (
        !finite(row.lap_duration) ||
        !finite(row.duration_sector_1) ||
        !finite(row.duration_sector_2) ||
        !finite(row.duration_sector_3)
      )
        return false;
      return (
        Number.isInteger(row.driver_number) &&
        row.driver_number > 0 &&
        Number.isInteger(row.lap_number) &&
        row.lap_number != null &&
        row.lap_number > 0 &&
        finite(row.lap_duration) &&
        row.lap_duration > 0 &&
        sectors.every((value) => finite(value) && value > 0) &&
        Math.abs(sectors.reduce<number>((sum, value) => sum + (value ?? 0), 0) - row.lap_duration) <
          0.5 &&
        Number.isFinite(Date.parse(row.date_start || '')) &&
        Date.parse(row.date_start || '') + row.lap_duration * 1000 <= now &&
        !row.is_pit_out_lap
      );
    })
    .sort((a, b) => a.lap_duration - b.lap_duration);
}

function interpolate(points: TimedPoint[], time: number) {
  const next = points.findIndex((point) => point.t >= time);
  if (next < 1) return null;
  const a = points[next - 1]!,
    b = points[next]!;
  const ratio = (time - a.t) / (b.t - a.t);
  return { t: time, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}

export function buildTrackGeometry(
  lap: ReferenceLap,
  locations: LocationRow[],
  sessionKey: number,
): TrackGeometry | null {
  const start = Date.parse(lap.date_start);
  const points = locations
    .filter(
      (row) =>
        row.driver_number === lap.driver_number &&
        row.session_key === sessionKey &&
        finite(row.x) &&
        finite(row.y) &&
        Date.parse(row.date) >= start &&
        Date.parse(row.date) <= start + lap.lap_duration * 1000,
    )
    .map((row) => ({ t: (Date.parse(row.date) - start) / 1000, x: row.x, y: -row.y }))
    .sort((a, b) => a.t - b.t)
    .filter((row, index, all) => !index || row.t > all[index - 1]!.t);
  // Sparse or partial position traces cannot reliably show a complete lap.
  if (
    points.length < 20 ||
    points[0]!.t > 1.5 ||
    lap.lap_duration - points.at(-1)!.t > 1.5 ||
    points.some((point, index) => index && point.t - points[index - 1]!.t > 1.5)
  )
    return null;
  const minX = Math.min(...points.map((point) => point.x)),
    maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)),
    maxY = Math.max(...points.map((point) => point.y));
  if (maxX - minX < 1 || maxY - minY < 1) return null;
  const firstSplit = interpolate(points, lap.duration_sector_1);
  const secondSplit = interpolate(points, lap.duration_sector_1 + lap.duration_sector_2);
  if (!firstSplit || !secondSplit) return null;
  const scale = Math.min(516 / (maxX - minX), 256 / (maxY - minY));
  const project = (point: TimedPoint): Point => [
    +(320 + (point.x - (minX + maxX) / 2) * scale).toFixed(2),
    +(180 + (point.y - (minY + maxY) / 2) * scale).toFixed(2),
  ];
  const ranges = [
    [
      points[0]!,
      ...points.filter((point) => point.t > points[0]!.t && point.t < firstSplit.t),
      firstSplit,
    ],
    [
      firstSplit,
      ...points.filter((point) => point.t > firstSplit.t && point.t < secondSplit.t),
      secondSplit,
    ],
    [secondSplit, ...points.filter((point) => point.t > secondSplit.t), points[0]!],
  ];
  return {
    version: 2,
    viewBox: [0, 0, 640, 360],
    start: project(points[0]!),
    direction:
      (Math.atan2(points[1]!.y - points[0]!.y, points[1]!.x - points[0]!.x) * 180) / Math.PI,
    sectors: ranges.map((range, index) => ({
      number: index + 1,
      time: [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3][index]!,
      points: range.map(project),
    })),
  };
}

export function sectorLabel(points: Point[]) {
  const distances = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index]![0], point[1] - points[index]![1]));
  const halfway = distances.reduce((sum, distance) => sum + distance, 0) / 2;
  let traversed = 0,
    anchor = points[0]!;
  for (let index = 0; index < distances.length; index++) {
    if (traversed + distances[index]! >= halfway) {
      const ratio = (halfway - traversed) / (distances[index] || 1);
      anchor = [
        points[index]![0] + (points[index + 1]![0] - points[index]![0]) * ratio,
        points[index]![1] + (points[index + 1]![1] - points[index]![1]) * ratio,
      ];
      break;
    }
    traversed += distances[index]!;
  }
  const dx = anchor[0] - 320,
    dy = anchor[1] - 180,
    distance = Math.hypot(dx, dy) || 1;
  return {
    anchor,
    label: [
      Math.max(26, Math.min(614, anchor[0] + (dx / distance) * 26)),
      Math.max(24, Math.min(336, anchor[1] + (dy / distance) * 26)),
    ],
  };
}

export function validateTrack(value: unknown): asserts value is TrackResponse {
  if (!isRecord(value)) throw new Error('The track map response is unavailable.');
  if (
    !value ||
    !['available', 'awaiting', 'failed'].includes(String(value.status)) ||
    !value.circuitId
  )
    throw new Error('The track map response is unavailable.');
  if (value.status !== 'available') return;
  const geometry = value.geometry;
  if (!isRecord(geometry) || !Array.isArray(geometry.sectors))
    throw new Error('The track map response is unavailable.');
  if (
    !value.reference ||
    !Number.isFinite(value.at) ||
    geometry.version !== 2 ||
    geometry.sectors.length !== 3 ||
    geometry.sectors.some(
      (sector: unknown, index) =>
        !isRecord(sector) ||
        sector.number !== index + 1 ||
        !Array.isArray(sector.points) ||
        sector.points.length < 2 ||
        sector.points.some(
          (point: unknown) =>
            !Array.isArray(point) ||
            point.length !== 2 ||
            point.some((coordinate) => !finite(coordinate)),
        ),
    )
  )
    throw new Error('The track map response is unavailable.');
}
