import type {
  Result,
  ScheduledSession,
  Section,
  Weekend,
} from '../../../shared/contracts/results.js';
import type { Retry } from '../../app/types.js';

import { formatDuration } from '../../../shared/domain/weekend.js';
import { TableHint, Unavailable, dash } from '../../components/data-display.js';
import { ChangedCell } from '../../components/motion.js';

import { useFavourites } from '../favourites/Favourites.js';

import { DriverEntry } from './DriverEntry.js';
export function ResultsTable({
  section,
  weekend,
  session,
  selected,
  onRetry,
}: {
  section?: Section<Result> | null;
  weekend: Weekend;
  session: ScheduledSession;
  selected: number | null;
  onRetry: Retry;
}) {
  const favourites = useFavourites();
  if (section?.status !== 'available')
    return <Unavailable section={section} noun="results" onRetry={onRetry} />;
  if (!section.data.length) return <p className="message">No classification has been published.</p>;
  const race = ['race', 'sprint'].includes(session.slug),
    qualifying = ['qualifying', 'sprint-qualifying'].includes(session.slug);
  const headings = race
    ? ['POS', 'DRIVER / TEAM', 'GRID', 'TIME / GAP', 'STATUS', 'LAPS', 'PTS']
    : qualifying
      ? ['POS', 'DRIVER / TEAM', 'Q1', 'Q2', 'Q3', 'STATUS']
      : ['POS', 'DRIVER / TEAM', 'BEST LAP', 'GAP', 'LAPS'];
  return (
    <>
      <div
        className="table-wrap"
        id="results-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable session results"
      >
        <table className="session-table" aria-label={`${session.name} results`}>
          <thead>
            <tr>
              {headings.map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.data.map((row) => (
              <tr
                key={
                  section.source === 'Jolpica F1'
                    ? row.driver.code || row.driver.name
                    : row.driver.number
                }
                data-favourite={
                  favourites.isDriver(row.driver) || favourites.isTeam(row.driver.team)
                    ? 'true'
                    : undefined
                }
                className={[
                  row.driver.number === selected ? 'selected-driver' : '',
                  favourites.isDriver(row.driver) || favourites.isTeam(row.driver.team)
                    ? 'favourite-row'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <ChangedCell className="position" value={row.positionLabel}>
                  {row.positionLabel}
                </ChangedCell>
                <td>
                  <DriverEntry
                    driver={row.driver}
                    weekend={weekend}
                    session={session}
                    selected={selected}
                  />
                </td>
                {race ? (
                  <>
                    <ChangedCell value={row.grid}>{dash(row.grid)}</ChangedCell>
                    <ChangedCell value={row.gap || row.time}>
                      {dash(row.gap || row.time)}
                    </ChangedCell>
                    <ChangedCell value={row.status}>{dash(row.status)}</ChangedCell>
                    <ChangedCell value={row.laps}>{dash(row.laps)}</ChangedCell>
                    <ChangedCell className="points" value={row.points}>
                      {row.points === null ? (
                        <span className="pending-points">Awaiting publication</span>
                      ) : (
                        row.points
                      )}
                    </ChangedCell>
                  </>
                ) : qualifying ? (
                  <>
                    {(row.qTimes || [null, null, null]).map((value, index) => (
                      <ChangedCell value={value} key={index}>
                        {typeof value === 'number' ? formatDuration(value) : dash(value)}
                      </ChangedCell>
                    ))}
                    <ChangedCell value={row.status}>{dash(row.status)}</ChangedCell>
                  </>
                ) : (
                  <>
                    <ChangedCell value={row.bestLap}>{formatDuration(row.bestLap)}</ChangedCell>
                    <ChangedCell value={row.gap}>
                      {typeof row.gap === 'number'
                        ? row.gap === 0
                          ? '—'
                          : '+' + row.gap.toFixed(3)
                        : dash(row.gap)}
                    </ChangedCell>
                    <ChangedCell value={row.laps}>{dash(row.laps)}</ChangedCell>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableHint />
    </>
  );
}
