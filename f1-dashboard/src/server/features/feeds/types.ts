import type { SessionSlug } from '../../../shared/contracts/results.js';
export type FeedKind = 'all' | 'results' | 'upcoming';
export type PublicationKind = Exclude<FeedKind, 'all'>;
export interface PublicationIdentity {
  kind: PublicationKind;
  season: string;
  round: string;
  slug: SessionSlug;
}
export interface ReminderSchedule {
  start: number | null;
  date: string;
  cancelled: boolean;
  venue: string;
}
interface FeedEntity extends PublicationIdentity {
  revision: number;
  signature: string;
  schedule?: ReminderSchedule;
}
interface FeedItem extends PublicationIdentity {
  guid: string;
  publishedAt: number;
  correction: boolean;
  title: string;
  description: string;
}
export interface FeedState {
  version: 1;
  createdAt: number;
  initialized: boolean;
  lastChanged: number;
  lastSuccessfulRefresh: number | null;
  entities: Record<string, FeedEntity>;
  items: FeedItem[];
}
export interface FeedStore {
  load(): Promise<FeedState | null>;
  save(state: FeedState): Promise<void>;
}
export interface FeedSnapshot {
  xml: string;
  etag: string;
  lastModified: string;
  modifiedAt: number;
  count: number;
  stale: boolean;
}
export interface FeedStatus {
  state: 'initializing' | 'ready' | 'degraded' | 'failed';
  items: number;
  lastAttempt: number | null;
  lastSuccessfulRefresh: number | null;
  message: string | null;
}
export interface FeedReader {
  snapshot(kind: FeedKind): FeedSnapshot | null;
  status(): FeedStatus;
}
