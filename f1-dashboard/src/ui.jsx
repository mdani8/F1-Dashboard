import { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ContentReveal, MotionButton, ease, timings, useMotionPreference } from './motion.jsx';

export const dash = value => value === null || value === undefined || value === '' ? '—' : value;
export const teamColors = {mclaren:'#ff8700',ferrari:'#ef3340',mercedes:'#27cdb2',red_bull:'#548aff',aston_martin:'#39bba0',alpine:'#ef78ba',williams:'#5b9eff',haas:'#d8d8df',rb:'#8c9dff',racing_bulls:'#8c9dff',sauber:'#8dde52',audi:'#f35050',cadillac:'#c2bba6'};
export const compoundColors = {SOFT:'#ff625b',MEDIUM:'#f2ce54',HARD:'#e6e7eb',INTERMEDIATE:'#66cd85',WET:'#61a6ed'};
export const compoundName = value => typeof value === 'string' && value.trim() ? value.toUpperCase() : 'UNKNOWN';
export function Compound({value}) {
  const name = compoundName(value);
  return <span className="compound-chip" style={{'--compound':compoundColors[name] || '#9298a4'}} title={name}><i aria-hidden="true" />{name}</span>;
}
export function Stamp({at,timezone,seconds = false}) {
  return at ? `Retrieved ${new Intl.DateTimeFormat('en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',...(seconds ? {second:'2-digit'} : {}),timeZone:timezone}).format(at)}` : 'Awaiting published data';
}
export function Notice({children,onRetry}) {
  return <p className="notice" role="status">{children}{onRetry && <MotionButton className="retry" onClick={onRetry}>Retry</MotionButton>}</p>;
}
export function CachedNotice({section,onRetry}) {
  return section?.stale ? <Notice onRetry={onRetry}>Refresh failed. Showing previously retrieved data, which may be out of date.</Notice> : null;
}
export function SourceNote({section,timezone,onRetry}) {
  return section ? <><p className="source-note">{section.source} · <Stamp at={section.at} timezone={timezone} seconds />{section.stale && ' · Cached data'}</p><CachedNotice section={section} onRetry={onRetry} /></> : null;
}
export function Unavailable({section,noun,onRetry}) {
  if (!section) return <p className="loading">Loading {noun}…</p>;
  const message = section.status === 'cancelled' ? 'This session was cancelled.' : section.status === 'scheduled' ? 'This session has not started yet.' : section.status === 'failed' ? `Could not load ${noun}.` : `${noun[0].toUpperCase() + noun.slice(1)} are awaiting publication. Free timing data becomes available after the session.`;
  return <div className="session-message" role="status"><p>{message}</p>{section.message && <p className="muted">{section.message}</p>}{section.status === 'failed' && <MotionButton className="retry" onClick={onRetry}>Retry</MotionButton>}</div>;
}
export function PanelHeading({eyebrow,title,id,number}) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div><span className="section-number" aria-hidden="true">{number}</span></div>;
}
export function TableHint() {return <p className="table-hint">Scroll the table for more rows and columns →</p>;}

export function Tabs({items,selected,onSelect,id,className,label,panelId}) {
  const refs = useRef(new Map());
  const strip = useRef(null);
  const reduced = useMotionPreference();
  useLayoutEffect(() => {
    const container = strip.current;
    if (!container) return;
    const revealSelected = () => {
      const button = refs.current.get(selected);
      if (!button) return;
      const tabRect = button.getBoundingClientRect(), stripRect = container.getBoundingClientRect();
      if (tabRect.right > stripRect.right) container.scrollLeft += tabRect.right - stripRect.right + 4;
      else if (tabRect.left < stripRect.left) container.scrollLeft -= stripRect.left - tabRect.left + 4;
    };
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(container);
    return () => observer.disconnect();
  },[selected,items.length]);
  function keyboard(event,index) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? items[0] : event.key === 'End' ? items.at(-1) : items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    refs.current.get(next.id)?.focus({preventScroll:true});
    onSelect(next.id);
  }
  return <LayoutGroup id={id}><div ref={strip} className={className} role="tablist" aria-label={label}>{items.map((item,index) => <MotionButton key={item.id} ref={element => {if (element) refs.current.set(item.id,element);else refs.current.delete(item.id);}}
    role="tab" id={className === 'tabs' ? `${item.id}-tab` : `session-tab-${item.id}`} data-session={className === 'tabs' ? undefined : item.id}
    aria-selected={item.id === selected} aria-controls={panelId || `${item.id}-panel`} tabIndex={item.id === selected ? 0 : -1}
    onMouseDown={event => {event.preventDefault();event.currentTarget.focus({preventScroll:true});}} onClick={() => onSelect(item.id)} onKeyDown={event => keyboard(event,index)}>
    {selected === item.id && <motion.span aria-hidden="true" className={className === 'tabs' ? 'tab-underline' : 'session-tab-highlight'} layoutId="active-indicator" transition={{duration:reduced ? 0 : timings.indicator,ease}} />}
    <span className="tab-label">{item.name}{item.cancelled && <small>Cancelled</small>}</span>
  </MotionButton>)}</div></LayoutGroup>;
}

export function SwitchingContent({identity,children,duration}) {
  return <AnimatePresence mode="wait"><ContentReveal key={identity} data-content-identity={identity} duration={duration}>{children}</ContentReveal></AnimatePresence>;
}
