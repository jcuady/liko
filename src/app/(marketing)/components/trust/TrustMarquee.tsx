'use client';

import * as React from 'react';
import {
  siCanvas,
  siGooglecalendar,
  siGoogleclassroom,
  siGoogledocs,
  siGoogleforms,
  siGooglesheets,
  siKahoot,
  siNotion,
} from 'simple-icons';

import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks/use-media-query';
import { Reveal } from '../Reveal';

/**
 * Trust marquee. The single marquee on the page.
 *
 * Marks are the real Simple Icons glyphs, not approximations: `simple-icons`
 * ships the official path data. Brands are rendered in a single neutral ink
 * rather than their own brand colours, because this is a compatibility
 * statement, not an endorsement, and a wall of competing brand hues would
 * break the one-accent rule.
 *
 * The duplicated track is `aria-hidden`, so a screen reader hears the list once.
 * Pause on hover and focus. Under reduced motion the list renders static.
 */

const MARKS = [
  { title: siGoogleclassroom.title, path: siGoogleclassroom.path },
  { title: siCanvas.title, path: siCanvas.path },
  { title: siKahoot.title, path: siKahoot.path },
  { title: siGooglesheets.title, path: siGooglesheets.path },
  { title: siGoogledocs.title, path: siGoogledocs.path },
  { title: siGooglecalendar.title, path: siGooglecalendar.path },
  { title: siGoogleforms.title, path: siGoogleforms.path },
  { title: siNotion.title, path: siNotion.path },
];

function Mark({ title, path }: { title: string; path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      className="h-6 w-auto shrink-0 text-ink-subtle opacity-55 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-100 md:h-7"
      fill="currentColor"
    >
      <path d={path} />
    </svg>
  );
}

export function TrustMarquee({ className }: { className?: string }) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <section
      aria-labelledby="trust-heading"
      className={cn('border-y border-border py-10 md:py-14', className)}
    >
      <div className="container-marketing">
        <Reveal>
          <p id="trust-heading" className="text-center text-label">
            Works alongside the tools your school already runs
          </p>
        </Reveal>

        {/*
          The wrapper reveals, never the track itself. The track is already
          driving `translateX` from a keyframe animation, and a Motion
          transform on the same element would fight it for the same property.
        */}
        <Reveal delay={0.08}>
          {reduceMotion ? (
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
              {MARKS.map((mark) => (
                <li key={mark.title}>
                  <Mark {...mark} />
                </li>
              ))}
            </ul>
          ) : (
            // Pause on hover and on focus is handled in CSS (`:hover`,
            // `:focus-within`) so there is no JS state feeding the animation.
            <div className="mt-8 overflow-hidden">
              <div className="liko-marquee-track">
                <ul className="flex shrink-0 items-center gap-12 md:gap-16">
                  {MARKS.map((mark) => (
                    <li key={mark.title}>
                      <Mark {...mark} />
                    </li>
                  ))}
                </ul>
                {/* Duplicate is decorative only. */}
                <ul aria-hidden="true" className="flex shrink-0 items-center gap-12 md:gap-16">
                  {MARKS.map((mark) => (
                    <li key={mark.title}>
                      <Mark {...mark} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Reveal>
      </div>

      <style>{`
        .liko-marquee-track {
          display: flex;
          width: max-content;
          animation: liko-marquee-scroll 46s linear infinite;
        }
        .liko-marquee-track:hover,
        .liko-marquee-track:focus-within {
          animation-play-state: paused;
        }
        @keyframes liko-marquee-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-50% - 2rem)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .liko-marquee-track { animation: none; }
        }
      `}</style>
    </section>
  );
}