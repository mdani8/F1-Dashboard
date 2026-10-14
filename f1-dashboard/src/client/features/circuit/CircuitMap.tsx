import { motion } from 'motion/react';
import { useId, useState } from 'react';
import type { Weekend } from '../../../shared/contracts/results.js';
import type { Point } from '../../../shared/contracts/track.js';

import { sectorLabel } from '../../../shared/domain/track-geometry.js';
import { formatDuration } from '../../../shared/domain/weekend.js';
import { Stamp } from '../../components/data-display.js';
import { MotionButton, ease, useMotionPreference } from '../../components/motion.js';
import { useTrack } from './use-track.js';
const colors = ['#ff625b', '#61a6ed', '#f2ce54'];
const path = (points: Point[]) =>
  points.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ');
export function CircuitMap({ weekend, timezone }: { weekend: Weekend; timezone: string }) {
  const { data, busy, error, refresh } = useTrack(weekend);
  const [selected, setSelected] = useState<number | null>(null);
  const reduced = useMotionPreference();
  const pattern = useId().replaceAll(':', '');
  const available = data?.status === 'available';
  const geometry = available ? data.geometry : null;
  const select = (number: number) =>
    setSelected((previous) => (previous === number ? null : number));
  return (
    <section
      className="panel circuit-panel"
      id="circuit-map"
      aria-labelledby="circuit-title"
      data-map-status={available ? 'available' : busy ? 'loading' : data?.status || 'failed'}
    >
      <div className="circuit-heading">
        <div>
          <p className="eyebrow">KNOW THE CIRCUIT</p>
          <h2 id="circuit-title">Track map &amp; sectors</h2>
        </div>
        <MotionButton
          className="map-refresh"
          aria-disabled={busy}
          onClick={() => {
            if (!busy) void refresh();
          }}
          aria-label="Refresh track map"
        >
          {busy ? 'Loading map…' : 'Refresh map'}
        </MotionButton>
      </div>
      {available && geometry && data.reference ? (
        <div className="circuit-layout">
          <div className="circuit-diagram">
            <svg
              viewBox={geometry.viewBox.join(' ')}
              role="img"
              aria-labelledby={`${pattern}-title ${pattern}-description`}
            >
              <title id={`${pattern}-title`}>
                {weekend.circuit}: three timing sectors and start/finish
              </title>
              <desc id={`${pattern}-description`}>
                Reference lap from {data.reference.season} {data.reference.session}.{' '}
                {geometry.orientation?.northUp && 'Geographic north is at the top.'} Sector 1 is
                red, sector 2 blue, sector 3 yellow. Use the sector buttons to highlight a section.
              </desc>
              <defs>
                <pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse">
                  <rect width="6" height="6" fill="#111317" />
                  <path d="M0 0h3v3H0zM3 3h3v3H3z" fill="#fff" />
                </pattern>
              </defs>
              <path
                className="circuit-outline"
                d={geometry.sectors.map((sector) => path(sector.points)).join(' ')}
              />
              {geometry.sectors.map((sector) => (
                <motion.path
                  key={sector.number}
                  className="circuit-sector"
                  data-sector={sector.number}
                  d={path(sector.points)}
                  stroke={colors[sector.number - 1]}
                  initial={false}
                  animate={{ opacity: selected === null || selected === sector.number ? 1 : 0.23 }}
                  transition={{ duration: reduced ? 0.1 : 0.14, ease }}
                  onClick={() => select(sector.number)}
                >
                  <title>
                    Sector {sector.number} · {formatDuration(sector.time)}
                  </title>
                </motion.path>
              ))}
              {geometry.sectors.map((sector) => {
                const { anchor, label } = sectorLabel(sector.points);
                return (
                  <g
                    key={sector.number}
                    className="circuit-label"
                    style={{ color: colors[sector.number - 1] }}
                  >
                    <line x1={anchor[0]} y1={anchor[1]} x2={label[0]} y2={label[1]} />
                    <text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle">
                      S{sector.number}
                    </text>
                  </g>
                );
              })}
              {geometry.sectors.slice(1).map((sector) => (
                <circle
                  key={sector.number}
                  className="sector-boundary"
                  cx={sector.points[0]![0]}
                  cy={sector.points[0]![1]}
                  r="5"
                />
              ))}
              <g transform={`translate(${geometry.start.join(' ')}) rotate(${geometry.direction})`}>
                <rect
                  className="start-finish"
                  x="-4"
                  y="-10"
                  width="8"
                  height="20"
                  fill={`url(#${pattern})`}
                />
                <path className="track-direction" d="M15 -4L21 0L15 4" />
              </g>
              {geometry.orientation?.northUp && (
                <g className="north-arrow" aria-hidden="true" data-north-up="true">
                  <path d="M595 47V20M589 28L595 19L601 28" />
                  <text x="595" y="65" textAnchor="middle">
                    N
                  </text>
                </g>
              )}
            </svg>
            <p className="circuit-caption">
              <span className="finish-key" aria-hidden="true" /> Start / finish <span>•</span> White
              dots mark sector splits
            </p>
          </div>
          <div className="circuit-details">
            <p className="map-circuit-name">{weekend.circuit}</p>
            <p className="map-instructions">
              Select a sector to highlight it. Times are from the reference lap below.
            </p>
            <div className="sector-controls" role="group" aria-label="Highlight track sectors">
              {geometry.sectors.map((sector) => (
                <MotionButton
                  key={sector.number}
                  className="sector-control"
                  aria-pressed={selected === sector.number}
                  onClick={() => select(sector.number)}
                  style={{ '--sector-color': colors[sector.number - 1] }}
                >
                  <span>
                    <i aria-hidden="true" /> Sector {sector.number}
                  </span>
                  <strong>{formatDuration(sector.time)}</strong>
                </MotionButton>
              ))}
            </div>
            <p className="map-reference">
              <strong>{data.reference.season} reference lap</strong>
              <br />
              {data.reference.driver.name} · {data.reference.session} · Lap {data.reference.lap}
              <br />
              Lap time {formatDuration(data.reference.duration)}
            </p>
            {data.reference.season !== weekend.season && (
              <p className="map-reference-note">
                Using a published {data.reference.season} layout until this season's lap positions
                are available.
              </p>
            )}
            <p className="map-source">
              OpenF1 · <Stamp at={data.at} timezone={timezone} />
            </p>
            {geometry.orientation?.northUp && (
              <p className="map-source">
                North up · Geographic reference:{' '}
                <a
                  href="https://github.com/bacinger/f1-circuits"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  F1 Circuits
                </a>
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="map-placeholder" role="status">
          <span aria-hidden="true">⌁</span>
          <p>
            {busy
              ? 'Loading the circuit and its three sectors…'
              : error ||
                (data?.status === 'failed'
                  ? 'Track positions are temporarily unavailable.'
                  : 'Awaiting a complete published reference lap.')}
          </p>
          {!busy && (
            <MotionButton className="retry" onClick={refresh}>
              Retry map
            </MotionButton>
          )}
        </div>
      )}
      {available && (
        <p className="map-footnote">
          Track diagram and sector splits follow recorded positions and timing from the reference
          lap.
        </p>
      )}
      {(data?.stale || data?.transportError || (error && available)) && (
        <p className="notice" role="status">
          Could not refresh the map. Showing the previously retrieved reference lap.
        </p>
      )}
    </section>
  );
}
