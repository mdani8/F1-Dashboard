import type { PropsWithChildren } from 'react';
import type { Provenance, Section } from '../../shared/contracts/results.js';
import type { Retry } from '../app/types.js';

import { MotionButton } from './motion.js';
export const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : value;
export const teamColors: Record<string, string> = {
  mclaren: '#ff8700',
  ferrari: '#ef3340',
  mercedes: '#27cdb2',
  red_bull: '#548aff',
  aston_martin: '#39bba0',
  alpine: '#ef78ba',
  williams: '#5b9eff',
  haas: '#d8d8df',
  rb: '#8c9dff',
  racing_bulls: '#8c9dff',
  sauber: '#8dde52',
  audi: '#f35050',
  cadillac: '#c2bba6',
};
export const compoundColors: Record<string, string> = {
  SOFT: '#ff625b',
  MEDIUM: '#f2ce54',
  HARD: '#e6e7eb',
  INTERMEDIATE: '#66cd85',
  WET: '#61a6ed',
};
export const compoundName = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.toUpperCase() : 'UNKNOWN';
export function Compound({ value }: { value: unknown }) {
  const name = compoundName(value);
  return (
    <span
      className="compound-chip"
      style={{ '--compound': compoundColors[name] || '#9298a4' }}
      title={name}
    >
      <i aria-hidden="true" />
      {name}
    </span>
  );
}
export function Stamp({
  at,
  timezone,
  seconds = false,
}: {
  at: number | null;
  timezone: string;
  seconds?: boolean;
}) {
  return at
    ? `Retrieved ${new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), timeZone: timezone }).format(at)}`
    : 'Awaiting published data';
}
export function Notice({ children, onRetry }: PropsWithChildren<{ onRetry?: Retry }>) {
  return (
    <p className="notice" role="status">
      {children}
      {onRetry && (
        <MotionButton className="retry" onClick={onRetry}>
          Retry
        </MotionButton>
      )}
    </p>
  );
}
export function CachedNotice({
  section,
  onRetry,
}: {
  section?: Pick<Provenance, 'stale'> | null;
  onRetry?: Retry;
}) {
  return section?.stale ? (
    <Notice onRetry={onRetry}>
      Refresh failed. Showing previously retrieved data, which may be out of date.
    </Notice>
  ) : null;
}
export function SourceNote({
  section,
  timezone,
  onRetry,
}: {
  section?: Provenance | null;
  timezone: string;
  onRetry?: Retry;
}) {
  return section ? (
    <>
      <p className="source-note">
        {section.source} · <Stamp at={section.at} timezone={timezone} seconds />
        {section.stale && ' · Cached data'}
      </p>
      <CachedNotice section={section} onRetry={onRetry} />
    </>
  ) : null;
}
export function Unavailable({
  section,
  noun,
  onRetry,
}: {
  section?: Pick<Section<never>, 'status' | 'message'> | null;
  noun: string;
  onRetry?: Retry;
}) {
  if (!section) return <p className="loading">Loading {noun}…</p>;
  const message =
    section.status === 'cancelled'
      ? 'This session was cancelled.'
      : section.status === 'scheduled'
        ? 'This session has not started yet.'
        : section.status === 'failed'
          ? `Could not load ${noun}.`
          : `${noun.charAt(0).toUpperCase() + noun.slice(1)} are awaiting publication. Free timing data becomes available after the session.`;
  return (
    <div className="session-message" role="status">
      <p>{message}</p>
      {section.message && <p className="muted">{section.message}</p>}
      {section.status === 'failed' && (
        <MotionButton className="retry" onClick={onRetry}>
          Retry
        </MotionButton>
      )}
    </div>
  );
}
export function PanelHeading({
  eyebrow,
  title,
  id,
  number,
}: {
  eyebrow: string;
  title: string;
  id: string;
  number: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      <span className="section-number" aria-hidden="true">
        {number}
      </span>
    </div>
  );
}
export function TableHint() {
  return <p className="table-hint">Scroll the table for more rows and columns →</p>;
}
