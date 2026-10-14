import {
  motion,
  MotionConfig,
  useAnimationControls,
  useInView,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

export const ease = [0.22, 1, 0.36, 1] as const;
export const timings = {
  page: 0.2,
  tab: 0.14,
  indicator: 0.18,
  disclosure: 0.22,
  analysis: 0.18,
  tire: 0.4,
  hover: 0.12,
  press: 0.08,
  highlight: 0.8,
};
const Preferences = createContext(false);
export const useMotionPreference = () => useContext(Preferences);

export function MotionProvider({ children }: PropsWithChildren) {
  const reduced = Boolean(useReducedMotion());
  return (
    <Preferences.Provider value={reduced}>
      <MotionConfig reducedMotion="user" transition={{ ease }}>
        {children}
      </MotionConfig>
    </Preferences.Provider>
  );
}

export function MotionButton({ children, ...props }: ComponentProps<typeof motion.button>) {
  const reduced = useMotionPreference();
  return (
    <motion.button
      {...props}
      whileTap={reduced || props.disabled || props['aria-disabled'] ? undefined : { scale: 0.985 }}
      transition={{ duration: timings.press }}
    >
      {children}
    </motion.button>
  );
}

export function MotionLink({ children, ...props }: ComponentProps<typeof motion.a>) {
  const reduced = useMotionPreference();
  return (
    <motion.a
      {...props}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={{ duration: timings.press }}
    >
      {children}
    </motion.a>
  );
}

export function PageReveal({
  children,
  onEntered,
  ...props
}: ComponentProps<typeof motion.div> & { onEntered?: () => void }) {
  const reduced = useMotionPreference();
  const present = useIsPresent();
  const [complete, setComplete] = useState(false);
  return (
    <motion.div
      {...props}
      data-page-motion={complete ? 'settled' : 'entering'}
      aria-hidden={present ? undefined : true}
      inert={present ? undefined : true}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 0 }}
      transition={{ duration: reduced ? 0.1 : timings.page, ease }}
      onAnimationComplete={() => {
        setComplete(true);
        if (present && !complete) onEntered?.();
      }}
    >
      {children}
    </motion.div>
  );
}

export function ContentReveal({
  children,
  duration = timings.tab,
  ...props
}: ComponentProps<typeof motion.div> & { duration?: number }) {
  const reduced = useMotionPreference();
  const present = useIsPresent();
  return (
    <motion.div
      {...props}
      aria-hidden={present ? undefined : true}
      inert={present ? undefined : true}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.1 : duration, ease }}
    >
      {children}
    </motion.div>
  );
}

export function RefreshIcon({ busy }: { busy: boolean }) {
  const reduced = useMotionPreference();
  return (
    <motion.span
      className="refresh-icon"
      aria-hidden="true"
      animate={{ rotate: busy && !reduced ? [0, 360] : 0 }}
      transition={
        busy && !reduced ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }
      }
    >
      ↻
    </motion.span>
  );
}

export function ChangedCell({
  value,
  children,
  ...props
}: Omit<ComponentProps<typeof motion.td>, 'value'> & { value: unknown }) {
  const signature = JSON.stringify(value);
  const previous = useRef(signature);
  const revision = useRef(0);
  const controls = useAnimationControls();
  const reduced = useMotionPreference();
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const current = ++revision.current;
    setHighlighted(true);
    void controls
      .start(
        { backgroundColor: ['rgba(255,69,58,0.16)', 'rgba(255,69,58,0)'] },
        { duration: reduced ? 0.1 : timings.highlight, ease },
      )
      .then(() => {
        if (current === revision.current) setHighlighted(false);
      });
    return () => {
      revision.current += 1;
      controls.stop();
    };
  }, [signature, controls, reduced]);
  return (
    <motion.td
      {...props}
      initial={false}
      animate={controls}
      data-value={signature}
      data-highlight={highlighted ? 'true' : 'false'}
    >
      {children}
    </motion.td>
  );
}

export function TireBar({ color, children, ...props }: ComponentProps<'span'> & { color: string }) {
  const reduced = useMotionPreference();
  const container = useRef<HTMLSpanElement>(null);
  // Observe the fixed bar geometry: a collapsed paint layer has no visible area.
  const visible = useInView(container, { once: true });
  return (
    <span {...props} ref={container}>
      <motion.span
        className="stint-paint"
        style={{ background: color, transformOrigin: 'left center' }}
        data-tire-reveal
        initial={{ scaleX: reduced ? 1 : 0 }}
        animate={{ scaleX: reduced || visible ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : timings.tire, ease }}
      />
      <span className="stint-label">{children}</span>
    </span>
  );
}
