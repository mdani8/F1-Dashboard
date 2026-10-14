import type { LapBundle } from '../../../shared/contracts/results.js';
import type { Retry } from '../../app/types.js';

import { formatDuration } from '../../../shared/domain/weekend.js';
import { Compound, TableHint, Unavailable, dash } from '../../components/data-display.js';
import { ChangedCell } from '../../components/motion.js';

import { fastestLaps, filteredLaps } from '../../../shared/domain/laps.js';
export function LapRecords({
  bundle,
  onRetry,
  filter,
}: {
  bundle: LapBundle | null;
  onRetry: Retry;
  filter: string;
}) {
  const section = bundle?.laps;
  if (!bundle || section?.status !== 'available')
    return <Unavailable section={section} noun="lap records" onRetry={onRetry} />;
  const annotationsKnown =
    bundle.annotations?.pits?.status === 'available' && !bundle.annotations.pits.stale;
  const shown = filteredLaps(section.data, filter, annotationsKnown);
  const fastest = fastestLaps(section.data, annotationsKnown);
  return (
    <>
      <p className="lap-driver-name">
        {bundle.driver?.name || 'Selected driver'}{' '}
        <span className="muted">/ {bundle.session.name}</span>
      </p>
      <div className="lap-summary">
        <span>
          {shown.length} of {section.data.length} laps
        </span>
        {fastest.duration !== null && (
          <span className="fastest-summary">
            ◆ Fastest recorded clean lap {formatDuration(fastest.duration)}
          </span>
        )}
      </div>
      {shown.length ? (
        <>
          <div
            className="table-wrap"
            id="laps-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable lap analysis"
          >
            <table className="lap-table" aria-label="Driver lap and sector times">
              <thead>
                <tr>
                  {['LAP', 'LAP TIME', 'SECTOR 1', 'SECTOR 2', 'SECTOR 3', 'TIRE', 'NOTES'].map(
                    (label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((lap) => (
                  <tr
                    key={lap.lap}
                    className={fastest.numbers.has(lap.lap) ? 'fastest-lap' : undefined}
                    data-fastest={fastest.numbers.has(lap.lap) ? 'true' : undefined}
                  >
                    <td>{dash(lap.lap)}</td>
                    <ChangedCell value={lap.duration}>
                      {formatDuration(lap.duration)}
                      {fastest.numbers.has(lap.lap) && <span className="fastest-tag">FASTEST</span>}
                    </ChangedCell>
                    {lap.sectors.map((value, index) => (
                      <ChangedCell key={index} value={value}>
                        {formatDuration(value)}
                      </ChangedCell>
                    ))}
                    <td>
                      <Compound value={lap.compound} />
                    </td>
                    <ChangedCell className="lap-notes" value={[lap.outLap, lap.pitLap]}>
                      {[lap.outLap ? 'Out lap' : '', lap.pitLap ? 'Pit lane' : '']
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </ChangedCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableHint />
        </>
      ) : (
        <p className="message" role="status">
          {filter === 'clean' && !annotationsKnown
            ? 'Clean-lap flags are unavailable for this session.'
            : 'No laps match this filter.'}
        </p>
      )}
      <p className="panel-footnote">
        Recorded lap timing. Fastest markers exclude known pit and out laps. Published
        classification determines session results.
        {Object.values(bundle.annotations || {}).some(
          (value) => value.status !== 'available' || value.stale,
        ) && ' Some tire or pit annotations are unavailable or cached.'}
      </p>
    </>
  );
}
