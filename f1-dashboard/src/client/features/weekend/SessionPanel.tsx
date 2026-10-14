import { useLayoutEffect, useRef, useState } from 'react';
import type { SessionContentProps } from '../../app/types.js';

import { SwitchingContent } from '../../components/SwitchingContent.js';

import { SessionContent } from './SessionContent.js';
export function SessionPanel({ ready, ...props }: SessionContentProps & { ready: boolean }) {
  const frame = useRef<HTMLDivElement>(null),
    height = useRef(0),
    changing = useRef(false);
  const identity = `${props.session.slug}:${props.selected ?? ''}`;
  const previous = useRef(identity);
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!changing.current && frame.current)
        height.current = frame.current.getBoundingClientRect().height;
    });
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (previous.current !== identity) {
      changing.current = true;
      setHeldHeight(height.current || frame.current?.getBoundingClientRect().height || 0);
      previous.current = identity;
    }
    if (!changing.current || !ready) return;
    // Keep the page tall enough while the old content exits and new data loads.
    // Otherwise the browser can clamp the scroll position before the request finishes.
    const timer = setTimeout(() => {
      const x = scrollX,
        y = scrollY;
      changing.current = false;
      setHeldHeight(null);
      requestAnimationFrame(() => window.scrollTo({ left: x, top: y, behavior: 'instant' }));
    }, 420);
    return () => clearTimeout(timer);
  }, [identity, ready]);
  return (
    <div
      ref={frame}
      id="session-content"
      role="tabpanel"
      tabIndex={0}
      aria-labelledby={`session-tab-${props.session.slug}`}
      style={{ minHeight: heldHeight ?? undefined }}
    >
      <SwitchingContent identity={props.session.slug}>
        <SessionContent {...props} />
      </SwitchingContent>
    </div>
  );
}
