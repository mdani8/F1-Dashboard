import { useMemo } from 'react';
import type {
  ScheduledSession,
  Section,
  TireStint,
  Weekend,
} from '../../../shared/contracts/results.js';
import type { Retry } from '../../app/types.js';

import {
  Compound,
  Unavailable,
  compoundColors,
  compoundName,
  dash,
} from '../../components/data-display.js';
import { TireBar } from '../../components/motion.js';

import { DriverEntry } from './DriverEntry.js';
export function TireTimelines({
  section,
  weekend,
  session,
  selected,
  onRetry,
}: {
  section?: Section<TireStint> | null;
  weekend: Weekend;
  session: ScheduledSession;
  selected: number | null;
  onRetry: Retry;
}) {
  const groups = useMemo(() => {
    const map = new Map<number | null, TireStint[]>();
    for (const stint of section?.data || []) {
      if (!map.has(stint.driver.number)) map.set(stint.driver.number, []);
      map.get(stint.driver.number)!.push(stint);
    }
    return [...map.values()];
  }, [section?.data]);
  if (section?.status !== 'available')
    return <Unavailable section={section} noun="tire stints" onRetry={onRetry} />;
  if (!section.data.length)
    return <p className="message">No tire stints are published for this session.</p>;
  const maxLap = Math.max(1, ...section.data.map((stint) => stint.lapEnd || stint.lapStart || 1));
  return (
    <>
      <div className="tire-legend">
        {['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map((value) => (
          <Compound key={value} value={value} />
        ))}
      </div>
      <div className="tire-timelines">
        {groups.map((stints) => (
          <div
            key={stints[0]!.driver.number}
            className={`tire-driver ${stints[0]!.driver.number === selected ? 'selected-driver' : ''}`}
          >
            <DriverEntry
              driver={stints[0]!.driver}
              weekend={weekend}
              session={session}
              selected={selected}
            />
            <div className="stint-track" aria-hidden="true">
              {stints
                .filter(
                  (stint) =>
                    stint.lapStart !== null &&
                    stint.lapEnd !== null &&
                    stint.lapEnd >= stint.lapStart,
                )
                .map((stint) => {
                  const name = compoundName(stint.compound),
                    left = Math.max(0, ((stint.lapStart! - 1) / maxLap) * 100),
                    width = Math.min(
                      100 - left,
                      ((stint.lapEnd! - stint.lapStart! + 1) / maxLap) * 100,
                    );
                  return (
                    <TireBar
                      key={stint.stint ?? stint.lapStart}
                      className="stint-bar"
                      style={{ left: left + '%', width: width + '%' }}
                      title={`${name} · laps ${stint.lapStart}–${stint.lapEnd}`}
                      color={compoundColors[name] || '#9298a4'}
                    >
                      {name === 'INTERMEDIATE' ? 'I' : name === 'UNKNOWN' ? '?' : name[0]}
                    </TireBar>
                  );
                })}
            </div>
            <ul className="stint-summary">
              {stints.map((stint, index) => {
                const length =
                  stint.lapStart !== null && stint.lapEnd !== null
                    ? stint.lapEnd - stint.lapStart + 1
                    : null;
                return (
                  <li key={stint.stint ?? index}>
                    <Compound value={stint.compound} />
                    <span>
                      L{dash(stint.lapStart)}–{dash(stint.lapEnd)} ·{' '}
                      {length === null
                        ? 'Length unavailable'
                        : `${length} ${length === 1 ? 'lap' : 'laps'}`}{' '}
                      · Starting age:{' '}
                      {stint.tyreAge === null
                        ? 'unavailable'
                        : `${stint.tyreAge} ${stint.tyreAge === 1 ? 'lap' : 'laps'}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
