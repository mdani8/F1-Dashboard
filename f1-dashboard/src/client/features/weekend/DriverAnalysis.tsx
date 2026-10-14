import { useState } from 'react';
import type { SessionContentProps } from '../../app/types.js';

import { weekendHref } from '../../../shared/domain/weekend.js';
import { PanelHeading, SourceNote } from '../../components/data-display.js';
import { MotionLink, timings } from '../../components/motion.js';
import { SwitchingContent } from '../../components/SwitchingContent.js';

import { useFavourites } from '../favourites/Favourites.js';

import { LapRecords } from './LapRecords.js';
export function DriverAnalysis({
  bundle,
  lapBundle,
  weekend,
  session,
  selected,
  timezone,
  onRetry,
}: SessionContentProps) {
  const [filter, setFilter] = useState('all');
  const favourites = useFavourites();
  const roster = bundle?.drivers?.data || [];
  return (
    <section className="panel lap-panel" aria-labelledby="lap-title">
      <PanelHeading eyebrow="LAP BY LAP" title="Driver analysis" id="lap-title" number="04" />
      <div className="driver-picker">
        <div className="picker-field">
          <label htmlFor="lap-driver">Driver</label>
          <select
            id="lap-driver"
            value={selected ?? ''}
            onChange={(event) => {
              location.hash = weekendHref(
                weekend.season,
                weekend.round,
                session.slug,
                event.target.value ? Number(event.target.value) : null,
              );
            }}
          >
            <option value="">Select a driver</option>
            {roster.map((driver) => (
              <option key={driver.number} value={driver.number ?? ''}>
                {favourites.isDriver(driver) || favourites.isTeam(driver.team) ? '★ ' : ''}
                {driver.name}
              </option>
            ))}
          </select>
        </div>
        {selected !== null && (
          <>
            <div className="picker-field">
              <label htmlFor="lap-filter">Laps</label>
              <select
                id="lap-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All laps</option>
                <option value="clean">Clean laps</option>
                <option value="pit">Pit laps</option>
                <option value="out">Out laps</option>
              </select>
            </div>
            <MotionLink
              className="text-link"
              href={weekendHref(weekend.season, weekend.round, session.slug)}
            >
              Close analysis
            </MotionLink>
          </>
        )}
      </div>
      {selected !== null ? (
        <>
          <SourceNote section={lapBundle?.laps} timezone={timezone} onRetry={onRetry} />
          <SwitchingContent identity={selected} duration={timings.analysis}>
            <LapRecords bundle={lapBundle} onRetry={onRetry} filter={filter} />
          </SwitchingContent>
        </>
      ) : (
        <p className="message">
          Select a driver in the results or choose one above to see their lap and sector times.
        </p>
      )}
    </section>
  );
}
