import type { SessionContentProps } from '../../app/types.js';

import { displaySession } from '../../../shared/domain/calendar.js';

import { PanelHeading, SourceNote } from '../../components/data-display.js';

import { DriverAnalysis } from './DriverAnalysis.js';
import { PitStopsTable } from './PitStopsTable.js';
import { ResultsTable } from './ResultsTable.js';
import { TireTimelines } from './TireTimelines.js';
export function SessionContent({
  bundle,
  lapBundle,
  weekend,
  session,
  selected,
  timezone,
  onRetry,
}: SessionContentProps) {
  return (
    <>
      <div className="session-heading">
        <h2>{session.name}</h2>
        <span>{displaySession(session, timezone)}</span>
      </div>
      {!['race', 'sprint'].includes(session.slug) && (
        <p className="points-note">No points awarded for this session.</p>
      )}
      <section className="panel results-panel" aria-labelledby="results-title">
        <PanelHeading
          eyebrow="THE CLASSIFICATION"
          title="Session results"
          id="results-title"
          number="01"
        />
        <SourceNote section={bundle?.results} timezone={timezone} onRetry={onRetry} />
        <ResultsTable
          section={bundle?.results}
          weekend={weekend}
          session={session}
          selected={selected}
          onRetry={onRetry}
        />
      </section>
      <div className="strategy-grid">
        <section className="panel" aria-labelledby="pit-title">
          <PanelHeading
            eyebrow="THROUGH THE PIT LANE"
            title="Pit stops"
            id="pit-title"
            number="02"
          />
          <SourceNote section={bundle?.pits} timezone={timezone} onRetry={onRetry} />
          <PitStopsTable
            section={bundle?.pits}
            weekend={weekend}
            session={session}
            selected={selected}
            onRetry={onRetry}
          />
        </section>
        <section className="panel" aria-labelledby="tire-title">
          <PanelHeading eyebrow="THE STRATEGY" title="Tire stints" id="tire-title" number="03" />
          <SourceNote section={bundle?.tires} timezone={timezone} onRetry={onRetry} />
          <TireTimelines
            section={bundle?.tires}
            weekend={weekend}
            session={session}
            selected={selected}
            onRetry={onRetry}
          />
        </section>
      </div>
      <DriverAnalysis
        bundle={bundle}
        lapBundle={lapBundle}
        weekend={weekend}
        session={session}
        selected={selected}
        timezone={timezone}
        onRetry={onRetry}
      />
    </>
  );
}
