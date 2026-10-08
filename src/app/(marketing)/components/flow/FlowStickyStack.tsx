'use client';

import * as React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';

import { cn } from '@/lib/utils';
import { useIsDesktop, usePrefersReducedMotion } from '@/lib/hooks/use-media-query';
import { FlowStageCard } from './FlowStageCard';
import { STAGES } from './stages';
import type { StageDefinition } from './stages';

/**
 * The Flow. A sticky stack.
 *
 * Canonical skeleton: every card except the last is held in place by
 * `position: sticky` while the next card travels up underneath it, and the
 * outgoing card's scale and opacity are driven by the scroll, so card n shrinks
 * as card n+1 arrives. The cards stay in normal flow, so the section keeps its
 * content-driven height and nothing is measured to pin it.
 *
 * Sticky rather than a scripted pin on purpose. Pinning by JS means a scroll
 * handler rewriting `position` on every frame; `position: sticky` is resolved by
 * the compositor, so the hold costs nothing per frame and cannot desynchronise
 * from the scroll position the way a scripted pin can.
 *
 * Motion is the only animation runtime on this route now. The deck reads one
 * scroll progress value and each card maps its own slice of it, so the whole
 * stack runs on a single listener.
 *
 * Below 768px this renders a plain vertical list: no pinning, no scroll-driven
 * scale, content-driven height. A sticky stack on a phone would eat the whole
 * screen. The same plain list is what a reduced-motion visitor gets, which
 * matches the promise that reduced motion removes the narrative rather than
 * shortening it.
 */

/** Vertical offset per card, in px. The deck cascades instead of collapsing flat. */
const CARD_STEP = 24;

export function FlowStickyStack({ className }: { className?: string }) {
  const isDesktop = useIsDesktop();
  const reduceMotion = usePrefersReducedMotion();
  const sectionRef = React.useRef<HTMLDivElement>(null);

  // One listener for the whole deck. Every card maps its own range out of this.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const stack = isDesktop && !reduceMotion;

  return (
    <div ref={sectionRef} className={cn(className)}>
      {STAGES.map((stage, index) => (
        <FlowStackCard
          key={stage.id}
          stage={stage}
          index={index}
          total={STAGES.length}
          progress={scrollYProgress}
          stack={stack}
          compact={!isDesktop}
        />
      ))}
    </div>
  );
}

function FlowStackCard({
  stage,
  index,
  total,
  progress,
  stack,
  compact,
}: {
  stage: StageDefinition;
  index: number;
  total: number;
  progress: MotionValue<number>;
  stack: boolean;
  compact: boolean;
}) {
  // The last card never shrinks: nothing ever arrives behind it.
  const outgoing = index < total - 1;

  // Card n dims across the slice of the section's scroll in which card n+1 is
  // travelling up into position. Uniform slices because the cards are the same
  // height, and the whole point is a continuous scrub rather than a trigger.
  const from = outgoing ? (index + 1) / total : 1;
  const to = outgoing ? (index + 2) / total : 1;

  const scale = useTransform(progress, [from, to], [1, 0.92]);
  const opacity = useTransform(progress, [from, to], [1, 0.45]);

  // Under the plain-list branch no motion value is written at all, so the card
  // carries no inline transform or opacity and cannot be left mid-scrub.
  const motionStyle = stack && outgoing ? { scale, opacity } : undefined;

  return (
    <motion.div
      style={
        stack
          ? {
              position: 'sticky',
              top: index * CARD_STEP,
              zIndex: index,
              ...motionStyle,
            }
          : undefined
      }
      className={cn(stack && 'will-change-transform')}
    >
      <FlowStageCard
        stage={stage}
        // Pinning is a desktop-only affordance; the mobile list must not
        // reserve viewport height per card.
        compact={compact}
      />
    </motion.div>
  );
}