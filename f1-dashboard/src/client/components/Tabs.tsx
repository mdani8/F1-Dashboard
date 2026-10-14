import { LayoutGroup, motion } from 'motion/react';
import type { KeyboardEvent } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { MotionButton, ease, timings, useMotionPreference } from './motion.js';
export function Tabs({
  items,
  selected,
  onSelect,
  id,
  className,
  label,
  panelId,
}: {
  items: { id: string; name: string; cancelled?: boolean }[];
  selected: string | null;
  onSelect: (id: string) => void;
  id: string;
  className: string;
  label: string;
  panelId?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const strip = useRef<HTMLDivElement>(null);
  const reduced = useMotionPreference();
  useLayoutEffect(() => {
    const container = strip.current;
    if (!container) return;
    const revealSelected = () => {
      const button = refs.current.get(selected || '');
      if (!button) return;
      const tabRect = button.getBoundingClientRect(),
        stripRect = container.getBoundingClientRect();
      if (tabRect.right > stripRect.right)
        container.scrollLeft += tabRect.right - stripRect.right + 4;
      else if (tabRect.left < stripRect.left)
        container.scrollLeft -= stripRect.left - tabRect.left + 4;
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selected, items.length]);
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? items[0]
        : event.key === 'End'
          ? items.at(-1)
          : items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    if (!next) return;
    refs.current.get(next.id)?.focus({ preventScroll: true });
    onSelect(next.id);
  }
  return (
    <LayoutGroup id={id}>
      <div ref={strip} className={className} role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <MotionButton
            key={item.id}
            ref={(element) => {
              if (element) refs.current.set(item.id, element);
              else refs.current.delete(item.id);
            }}
            role="tab"
            id={className === 'tabs' ? `${item.id}-tab` : `session-tab-${item.id}`}
            data-session={className === 'tabs' ? undefined : item.id}
            aria-selected={item.id === selected}
            aria-controls={panelId || `${item.id}-panel`}
            tabIndex={item.id === selected ? 0 : -1}
            onMouseDown={(event) => {
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
            }}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => keyboard(event, index)}
          >
            {selected === item.id && (
              <motion.span
                aria-hidden="true"
                className={className === 'tabs' ? 'tab-underline' : 'session-tab-highlight'}
                layoutId="active-indicator"
                transition={{ duration: reduced ? 0 : timings.indicator, ease }}
              />
            )}
            <span className="tab-label">
              {item.name}
              {item.cancelled && <small>Cancelled</small>}
            </span>
          </MotionButton>
        ))}
      </div>
    </LayoutGroup>
  );
}
