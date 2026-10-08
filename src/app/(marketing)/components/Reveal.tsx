'use client';

import * as React from 'react';
import { motion } from 'motion/react';

import { usePrefersReducedMotion } from '@/lib/hooks/use-media-query';

/**
 * Scroll reveal.
 *
 * One primitive, used by every section that opts in. It exists so motion stays
 * motivated rather than decorative: a section's blocks arrive in reading order,
 * which tells the eye where to start and makes a long page feel sequenced
 * instead of dumped. Pass an increasing `delay` to stagger siblings, roughly
 * 0.06s apart.
 *
 * Only `transform` and `opacity` move, both compositor-friendly, and the whole
 * thing collapses to a plain block under `prefers-reduced-motion`.
 *
 * The reduced-motion branch is a fast path that avoids scheduling the animation
 * at all. It is deliberately not the only guard: `globals.css` also pins
 * `[data-reveal]` visible inside the reduced-motion media query, because a
 * reveal that stays at `opacity: 0` hides content from exactly the visitors who
 * asked for less movement, which is the worst possible failure here.
 *
 * Motion owns UI state, these reveals, and the two scroll narratives in the
 * Flow and Roles sections. It is the only animation runtime this route ships,
 * so a visitor downloads one animation library rather than two competing for
 * the same frames.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 16,
  className,
}: {
  children: React.ReactNode;
  /** Seconds. Stagger siblings about 0.06s apart, never past ~0.3s. */
  delay?: number;
  /** Travel in pixels. Small reads as considered, large reads as a slide. */
  distance?: number;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -10% 0px' }}
      transition={{
        duration: 0.55,
        delay,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      {children}
    </motion.div>
  );
}