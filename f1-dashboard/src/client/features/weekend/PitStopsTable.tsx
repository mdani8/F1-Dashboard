import type {
  PitStop,
  ScheduledSession,
  Section,
  Weekend,
} from '../../../shared/contracts/results.js';
import type { Retry } from '../../app/types.js';

import { TableHint, Unavailable, dash } from '../../components/data-display.js';
import { ChangedCell } from '../../components/motion.js';

import { DriverEntry } from './DriverEntry.js';
export function PitStopsTable({
  section,
  weekend,
  session,
  selected,
  onRetry,
}: {
  section?: Section<PitStop> | null;
  weekend: Weekend;
  session: ScheduledSession;
  selected: number | null;
  onRetry: Retry;
}) {
  if (section?.status !== 'available')
    return <Unavailable section={section} noun="pit-stop records" onRetry={onRetry} />;
  if (!section.data.length)
    return <p className="message">No pit activity is published for this session.</p>;
  return (
    <>
      <div
        className="table-wrap"
        id="pits-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable pit stops"
      >
        <table className="pit-table" aria-label="Pit stops">
          <thead>
            <tr>
              {['LAP', 'DRIVER', 'STOP', 'PIT LANE'].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.data.map((pit, index) => (
              <tr key={`${pit.driver.number}:${pit.lap}:${pit.date || index}`}>
                <ChangedCell value={pit.lap}>{dash(pit.lap)}</ChangedCell>
                <td>
                  <DriverEntry
                    driver={pit.driver}
                    weekend={weekend}
                    session={session}
                    selected={selected}
                  />
                </td>
                <ChangedCell value={pit.stopDuration}>
                  {pit.stopDuration === null ? '—' : pit.stopDuration.toFixed(3) + 's'}
                </ChangedCell>
                <ChangedCell value={pit.laneDuration}>
                  {pit.laneDuration === null ? '—' : pit.laneDuration.toFixed(3) + 's'}
                </ChangedCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableHint />
      <p className="panel-footnote">
        Stop = stationary time. Pit lane = total time travelling through the pit lane.
      </p>
    </>
  );
}
