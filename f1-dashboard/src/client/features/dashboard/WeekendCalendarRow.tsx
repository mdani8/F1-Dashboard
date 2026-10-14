import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Race } from '../../../shared/contracts/providers.js';
import {
  displayDate,
  displaySession,
  isUpcoming,
  sessions,
} from '../../../shared/domain/calendar.js';
import { weekendHref } from '../../../shared/domain/weekend.js';
import {
  MotionButton,
  MotionLink,
  ease,
  timings,
  useMotionPreference,
} from '../../components/motion.js';

export function WeekendCalendarRow({
  race,
  season,
  open,
  onToggle,
  isNext,
  timezone,
  time,
}: {
  race: Race;
  season: string;
  open: boolean;
  onToggle: (round: string) => void;
  isNext: boolean;
  timezone: string;
  time: number;
}) {
  const body = useRef<HTMLDivElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const reduced = useMotionPreference();
  const [closed, setClosed] = useState(!open);
  useLayoutEffect(() => {
    if (open) setClosed(false);
  }, [open]);
  const upcoming = isUpcoming(race, time);
  const scheduleId = `schedule-${season}-${race.round}`;
  function toggleSchedule() {
    if (open && body.current?.contains(document.activeElement))
      toggle.current?.focus({ preventScroll: true });
    onToggle(race.round);
  }
  return (
    <article
      className={`race-row ${upcoming ? 'upcoming' : 'past'} ${isNext ? 'next' : ''} ${open ? 'is-open' : ''}`}
      data-round={race.round}
    >
      <div className="race-row-heading">
        <MotionLink
          className="race-open"
          href={weekendHref(season, race.round)}
          aria-label={`${race.raceName} results`}
        >
          <span className="race-round">{String(race.round).padStart(2, '0')}</span>
          <span className="race-date">
            {displayDate(race, timezone, { day: '2-digit' })}
            <span>{displayDate(race, timezone, { month: 'short' }).toUpperCase()}</span>
          </span>
          <div className="race-info">
            <h3>{race.raceName}</h3>
            <p>{race.Circuit.circuitName}</p>
          </div>
          <span className="race-status">{isNext ? 'NEXT UP' : upcoming ? 'UPCOMING' : 'PAST'}</span>
        </MotionLink>
        <MotionButton
          ref={toggle}
          className="schedule-toggle"
          data-schedule={scheduleId}
          aria-label={`${race.raceName} schedule`}
          aria-expanded={open}
          aria-controls={scheduleId}
          onClick={toggleSchedule}
        >
          <motion.span
            className="chevron"
            aria-hidden="true"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: reduced ? 0 : timings.disclosure, ease }}
          >
            ›
          </motion.span>
        </MotionButton>
      </div>
      <motion.div
        ref={body}
        className="schedule-reveal"
        hidden={closed && !open}
        inert={open ? undefined : true}
        aria-hidden={open ? undefined : true}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : timings.disclosure, ease }}
        onAnimationComplete={() => {
          if (!open) setClosed(true);
        }}
      >
        <ul className="sessions" id={scheduleId}>
          {sessions(race).map((session) => (
            <li key={session.slug} className={session.slug === 'race' ? 'race-session' : ''}>
              <MotionLink href={weekendHref(season, race.round, session.slug)}>
                {session.name} <span aria-hidden="true">↗</span>
              </MotionLink>
              <span>{displaySession(session, timezone)}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </article>
  );
}
