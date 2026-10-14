import type { Dispatch, SetStateAction } from 'react';
import type { CalendarPayload, StandingsPayload } from '../../shared/contracts/providers.js';
import type {
  CachedResponse,
  LapBundle,
  ScheduledSession,
  SessionBundle,
  Weekend,
} from '../../shared/contracts/results.js';
export type Refresh = (force?: boolean) => Promise<void>;
export type Retry = () => void | Promise<void>;
export interface DashboardState {
  calendar: CachedResponse<CalendarPayload> | null;
  drivers: CachedResponse<StandingsPayload> | null;
  constructors: CachedResponse<StandingsPayload> | null;
  calendarError: string | null;
  driversError: string | null;
  constructorsError: string | null;
  busy: boolean;
}
export interface DashboardSelection {
  tab: string;
  season: string | null;
  openRounds: Set<string>;
}
export type SetDashboardSelection = Dispatch<SetStateAction<DashboardSelection>>;
export interface WeekendState {
  weekend: Weekend | null;
  bundle: SessionBundle | null;
  lapBundle: LapBundle | null;
  selectedSession: string | null;
  busy: boolean;
  error: string | null;
  readyHash: string | null;
}
export interface SessionContentProps {
  bundle: SessionBundle | null;
  lapBundle: LapBundle | null;
  weekend: Weekend;
  session: ScheduledSession;
  selected: number | null;
  timezone: string;
  onRetry: Retry;
}
