import { useEffect, useState } from 'react';

import { REFRESH_INTERVAL } from '../../shared/domain/weekend.js';
export function useClock(enabled: boolean) {
  const [time, setTime] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    setTime(Date.now());
    const timer = setInterval(() => setTime(Date.now()), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [enabled]);
  return time;
}
