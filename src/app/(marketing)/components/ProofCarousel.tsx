'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

import { Reveal } from './Reveal';

/**
 * The testimonial carousel.
 *
 * Split out of `Proof` because this is the only part of the section that needs
 * a runtime: the active index, the crossfade between quotes, and the two
 * buttons. The quotes, the section heading, and the section shell stay on the
 * server, so the copy ships as HTML instead of as client JavaScript.
 *
 * The markup, the button labels, and the `aria-live` announcement are unchanged,
 * so assistive technology still gets the same controls and the same count.
 */

export interface Quote {
  quote: string;
  name: string;
  role: string;
}

/** The one easing curve the marketing motion shares, so nothing drifts apart. */
const EASE = [0.23, 1, 0.32, 1] as const;

export function ProofCarousel({ quotes }: { quotes: Quote[] }) {
  const [index, setIndex] = React.useState(0);
  const reduceMotion = useReducedMotion();

  const go = (delta: number) =>
    setIndex((current) => (current + delta + quotes.length) % quotes.length);

  return (
    <div className="mt-14 md:mt-20">
      <Reveal>
        <figure className="max-w-[52rem]">
          {/*
            Swapping the quote crossfades rather than cutting. The old line
            leaves upward and the new one arrives from below, so the reader
            can tell the text changed instead of wondering whether they
            misread it. `mode="wait"` keeps them from overlapping, and the
            whole thing is bypassed under reduced motion.
          */}
          {reduceMotion ? (
            <blockquote>
              <p className="text-h3 text-ink">&ldquo;{quotes[index].quote}&rdquo;</p>
            </blockquote>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.blockquote
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: EASE }}
              >
                <p className="text-h3 text-ink">&ldquo;{quotes[index].quote}&rdquo;</p>
              </motion.blockquote>
            </AnimatePresence>
          )}
          <figcaption className="mt-6">
            <span className="text-[0.9375rem] font-medium text-ink">
              {quotes[index].name}
            </span>
            <span className="ml-2 text-[0.9375rem] text-ink-subtle">
              {quotes[index].role}
            </span>
          </figcaption>
        </figure>
      </Reveal>

      {/*
        No autoplay. A carousel that advances on its own moves text out from
        under a reader mid-sentence, and it needs a pause control to be
        accessible at all. Explicit controls only.
      */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous quote"
          className="pressable grid size-11 place-items-center rounded-full border border-border bg-surface text-ink hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next quote"
          className="pressable grid size-11 place-items-center rounded-full border border-border bg-surface text-ink hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
        </button>
        <span className="tabular ml-2 text-[0.8125rem] text-ink-subtle">
          {index + 1} of {quotes.length}
        </span>
        <span className="sr-only" aria-live="polite">
          Showing quote {index + 1} of {quotes.length}
        </span>
      </div>
    </div>
  );
}