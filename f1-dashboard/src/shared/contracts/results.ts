export type SessionSlug =
  | 'practice-1'
  | 'practice-2'
  | 'practice-3'
  | 'qualifying'
  | 'sprint-qualifying'
  | 'sprint'
  | 'race';
type Availability = 'scheduled' | 'cancelled' | 'awaiting' | 'available' | 'failed';
type Scalar = string | number | null;
export interface SessionDate {
  date: string;
  time?: string | null;
}
export interface ScheduledSession extends SessionDate {
  name: string;
  slug: SessionSlug;
  start?: number | null;
  end?: number | null;
  sessionKey?: number | null;
  cancelled?: boolean;
  cancellationKnown?: boolean;
}
export interface Provenance {
  source: string;
  at: number | null;
  stale: boolean;
  message?: string | null;
}
export interface Section<T> extends Provenance {
  status: Availability;
  data: T[];
  retryAt?: number | null;
}
export interface CachedResponse<T> {
  data: T;
  at: number;
  stale: boolean;
  source?: string;
  message?: string;
  error?: string;
  retryAt?: number | null;
}
export interface Weekend extends SessionDate {
  season: string;
  round: string;
  name: string;
  circuitId: string;
  circuit: string;
  location: string | null;
  country: string | null;
  sessions: ScheduledSession[];
  meetingKey: number | null;
  pollFrom: number;
  pollUntil: number;
  metadata: { calendar: Provenance; timing: Provenance };
  transportError?: string;
}
export interface Driver {
  number: number | null;
  name: string;
  code?: string | null;
  team?: string | null;
  color?: string | null;
}
export interface Result {
  driver: Driver;
  position: number | null;
  positionLabel: string;
  grid: number | null;
  laps: number | null;
  points: number | null;
  time: string | null;
  gap: Scalar;
  status: string | null;
  qTimes: Scalar[] | null;
  bestLap: number | null;
}
export interface PitStop {
  driver: Driver;
  lap: number | null;
  date: string | null;
  stopDuration: number | null;
  laneDuration: number | null;
}
export interface TireStint {
  driver: Driver;
  stint: number | null;
  compound: string | null;
  lapStart: number | null;
  lapEnd: number | null;
  tyreAge: number | null;
}
export interface Lap {
  lap: number | null;
  duration: number | null;
  sectors: (number | null)[];
  compound: string | null;
  outLap: boolean | null;
  pitLap: boolean;
}
export interface SessionBundle {
  weekend: Weekend;
  session: ScheduledSession;
  drivers: Section<Driver>;
  results: Section<Result>;
  pits: Section<PitStop>;
  tires: Section<TireStint>;
  transportError?: string;
}
export interface LapBundle {
  session: ScheduledSession;
  driver: Driver | null;
  laps: Section<Lap>;
  annotations?: {
    tires: Pick<Section<never>, 'status' | 'stale'>;
    pits: Pick<Section<never>, 'status' | 'stale'>;
  };
  transportError?: string;
}
interface WeekendRoute {
  invalid?: false;
  season: string;
  round: string;
  session: string | null;
  driver: number | null;
}
interface InvalidRoute {
  invalid: true;
  season?: never;
  round?: never;
  session?: never;
  driver?: never;
}
export type Route = WeekendRoute | InvalidRoute | null;
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type Clock = () => number;
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
