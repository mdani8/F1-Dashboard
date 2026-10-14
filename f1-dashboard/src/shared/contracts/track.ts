import type { Driver } from './results.js';
export type Point = [number, number];
interface Sector {
  number: number;
  time: number;
  points: Point[];
}
export interface TrackGeometry {
  version: number;
  viewBox: number[];
  start: Point;
  direction: number;
  sectors: Sector[];
  orientation?: {
    northUp: boolean;
    rotation?: number;
    fitError?: number;
    source?: string;
    geographicId?: string;
  };
}
export interface GeographicReference {
  geographicId: string;
  coordinates: Point[];
}
export interface TrackResponse {
  status: 'available' | 'awaiting' | 'failed';
  circuitId: string;
  circuitName: string;
  source: string;
  at: number | null;
  stale: boolean;
  geometry: TrackGeometry | null;
  reference: {
    season: string;
    session: string;
    sessionKey: number;
    driver: Driver;
    lap: number;
    duration: number;
  } | null;
  message?: string;
  transportError?: string;
}
