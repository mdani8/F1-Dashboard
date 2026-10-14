import type { FeedState, PublicationIdentity, ReminderSchedule } from './types.js';

interface Publication extends PublicationIdentity {
  signature: string;
  description: string;
  title: string;
  schedule: ReminderSchedule | null;
}
export function nextPublication(
  state: FeedState,
  publication: Publication,
  at: number,
): FeedState | null {
  const { kind, season, round, slug, signature, description, title, schedule } = publication;
  const key = `${kind}:${season}:${round}:${slug}`;
  const previous = state.entities[key];
  if (previous?.signature === signature) return null;
  const revision = (previous?.revision || 0) + 1;
  const next = structuredClone(state);
  const identity: PublicationIdentity = { kind, season, round, slug };
  next.entities[key] = { ...identity, revision, signature, ...(schedule ? { schedule } : {}) };
  next.items.unshift({
    ...identity,
    guid: `urn:gridline:${key}:v${revision}`,
    publishedAt: at,
    correction: Boolean(previous),
    title,
    description,
  });
  next.items = next.items.slice(0, 500);
  next.lastChanged = at;
  next.initialized = true;
  return next;
}
