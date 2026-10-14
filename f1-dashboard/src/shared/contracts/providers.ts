import type { SessionDate } from './results.js';

export interface JolpicaDriver {
  driverId?: string;
  code?: string;
  permanentNumber?: string;
  givenName?: string;
  familyName?: string;
}
interface Constructor {
  constructorId?: string;
  name?: string;
}
export interface JolpicaResult {
  Driver: JolpicaDriver;
  Constructor: Constructor;
  number?: string;
  position?: string;
  positionText?: string;
  grid?: string;
  laps?: string;
  points?: string;
  status?: string;
  Time?: { time?: string };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
export interface Race extends SessionDate {
  season?: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location?: { locality?: string; country?: string };
  };
  FirstPractice?: SessionDate;
  SecondPractice?: SessionDate;
  ThirdPractice?: SessionDate;
  Qualifying?: SessionDate;
  SprintQualifying?: SessionDate;
  SprintShootout?: SessionDate;
  Sprint?: SessionDate;
  Results?: JolpicaResult[];
  QualifyingResults?: JolpicaResult[];
  SprintResults?: JolpicaResult[];
}
export interface CalendarTable {
  season: string;
  Races: Race[];
}
export interface CalendarPayload {
  MRData: { RaceTable: CalendarTable };
}
interface Standing {
  position?: string;
  positionText?: string;
  points?: string;
  wins?: string;
  Driver?: JolpicaDriver;
  Constructor?: Constructor;
  Constructors?: Constructor[];
}
export interface StandingsList {
  season: string;
  round: string;
  DriverStandings?: Standing[];
  ConstructorStandings?: Standing[];
}
export interface StandingsPayload {
  MRData: { StandingsTable: { season: string; StandingsLists: StandingsList[] } };
}
export interface OpenSession {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  year: number;
  circuit_key: number;
  circuit_short_name?: string;
  location?: string;
  country_name?: string;
  is_cancelled?: boolean;
}
export interface OpenTiming {
  session_key?: number;
  driver_number: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  name_acronym?: string;
  team_name?: string;
  team_colour?: string;
  position?: number | null;
  number_of_laps?: number | null;
  duration?: number | (number | null)[] | null;
  gap_to_leader?: number | string | (number | null)[] | null;
  dsq?: boolean;
  dns?: boolean;
  dnf?: boolean;
  lap_number?: number | null;
  date?: string;
  stop_duration?: number | null;
  lane_duration?: number | null;
  pit_duration?: number | null;
  stint_number?: number;
  compound?: string | null;
  lap_start?: number | null;
  lap_end?: number | null;
  tyre_age_at_start?: number | null;
  lap_duration?: number | null;
  duration_sector_1?: number | null;
  duration_sector_2?: number | null;
  duration_sector_3?: number | null;
  is_pit_out_lap?: boolean | null;
  date_start?: string;
}
export interface ReferenceLap extends OpenTiming {
  lap_number: number;
  lap_duration: number;
  duration_sector_1: number;
  duration_sector_2: number;
  duration_sector_3: number;
  date_start: string;
}
export interface LocationRow {
  driver_number: number;
  session_key: number;
  date: string;
  x: number;
  y: number;
}
