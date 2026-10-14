import { useEffect, useState } from 'react';
import type { ScheduledSession, Weekend } from '../../../shared/contracts/results.js';
import { weekendCalendar } from '../../../shared/domain/calendar-export.js';
import { countdown } from '../../../shared/domain/countdown.js';
import { MotionButton } from '../../components/motion.js';
import { useVisibility } from '../../hooks/use-visibility.js';

export function SessionCountdown({
  sessions,
  compact = false,
}: {
  sessions: ScheduledSession[];
  compact?: boolean;
}) {
  const visible = useVisibility();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible]);
  const next = countdown(sessions, now);
  if (!next)
    return compact ? null : (
      <p className="session-countdown muted">All scheduled sessions have started.</p>
    );
  return (
    <div className={`session-countdown ${compact ? 'compact' : ''}`}>
      <span>
        {next.session.name} {next.seconds === null ? '' : 'starts in'}
      </span>
      <strong role="timer" aria-live="off">
        {next.text}
      </strong>
    </div>
  );
}

export function CalendarExport({ weekend }: { weekend: Weekend }) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([weekendCalendar(weekend, { origin: location.origin })], {
        type: 'text/calendar;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `gridline-${weekend.season}-round-${weekend.round}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <MotionButton
      className="calendar-export"
      onClick={download}
      title="Download all scheduled sessions for this weekend"
    >
      ↓ Export calendar
    </MotionButton>
  );
}
