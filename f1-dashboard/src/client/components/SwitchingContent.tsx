import type { PropsWithChildren } from 'react';

import { AnimatePresence } from 'motion/react';
import { ContentReveal } from './motion.js';
export function SwitchingContent({
  identity,
  children,
  duration,
}: PropsWithChildren<{ identity: string | number; duration?: number }>) {
  return (
    <AnimatePresence mode="wait">
      <ContentReveal key={identity} data-content-identity={identity} duration={duration}>
        {children}
      </ContentReveal>
    </AnimatePresence>
  );
}
