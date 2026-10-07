'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

import { SectionHeader } from './SectionHeader';
import { Reveal } from './Reveal';

/**
 * Proof. Three testimonials.
 *
 * The figures that used to open this section now sit directly under the hero,
 * in `StatsBand`, carrying their illustrative-figures caveat with them. What
 * stayed here is the part that could not move: the only three named accounts on
 * the page, unchanged and attributed exactly as they were.
 *
 * Every figure is illustrative rather than measured, and says so where it is
 * printed. Shipping an unsourced statistic about teachers would be the exact
 * kind of claim the brand voice rules out.
 */

/** The one easing curve the marketing motion shares, so nothing drifts apart. */
const EASE = [0.23, 1, 0.32, 1] as const;

const QUOTES = [
  {
    quote:
      'I stopped maintaining a parallel spreadsheet the week I moved my gradebook over. The first time I needed to explain a mark to a parent, I had the rubric right there.',
    name: 'Maya Okonkwo',
    role: 'Chemistry teacher, four sections',
  },
  {
    quote:
      'The at-risk flags are the part. I get told in week six now, which is early enough to actually do something about it.',
    name: 'Dev Ramanathan',
    role: 'Department head, K-8',
  },
  {
    quote:
      'It works on my phone in a corridor with no signal, and the marks are there when I get back to the office. That was not true of anything else I tried.',
    name: 'Ingrid Halvorsen',
    role: 'Science teacher, rural district',
  },
];

export function Proof() {
  const [index, setIndex] = React.useState(0);
  const reduceMotion = useReducedMotion();

  const go = (delta: number) =>
    setIndex((current) => (current + delta + QUOTES.length) % QUOTES.length);

  return (
    <section
      id="proof"
      aria-labelledby="proof-title"
      className="chapter border-y border-border bg-surface-sunken"
    >
      <div className="container-marketing">
        <SectionHeader
          label="Why teachers switch"
          id="proof-title"
          title="The week stops being a relay between tabs."
        />

        {/*
          No autoplay. A carousel that advances on its own moves text out from
          under a reader mid-sentence, and it needs a pause control to be
          accessible at all. Explicit controls only.
        */}
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
                  <p className="text-h3 text-ink">&ldquo;{QUOTES[index].quote}&rdquo;</p>
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
                    <p className="text-h3 text-ink">&ldquo;{QUOTES[index].quote}&rdquo;</p>
                  </motion.blockquote>
                </AnimatePresence>
              )}
              <figcaption className="mt-6">
                <span className="text-[0.9375rem] font-medium text-ink">
                  {QUOTES[index].name}
                </span>
                <span className="ml-2 text-[0.9375rem] text-ink-subtle">
                  {QUOTES[index].role}
                </span>
              </figcaption>
            </figure>
          </Reveal>

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
              {index + 1} of {QUOTES.length}
            </span>
            <span className="sr-only" aria-live="polite">
              Showing quote {index + 1} of {QUOTES.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}