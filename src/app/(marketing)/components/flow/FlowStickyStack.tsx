'use client';

import * as React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/hooks/use-media-query';
import { FlowStageCard } from './FlowStageCard';
import { STAGES } from './stages';

/**
 * The Flow. A GSAP sticky stack.
 *
 * Canonical skeleton: each card except the last is pinned, and the outgoing
 * card's scale and opacity are driven by a ScrollTrigger on the *next* card, so
 * card n shrinks as card n+1 arrives. `pinSpacing: false` lets the cards stack
 * rather than push each other apart.
 *
 * This file never touches Motion, and nothing in the app shell uses GSAP. The
 * two libraries fight over the same frames.
 *
 * Below 768px this renders a plain vertical list: no pinning, no ScrollTrigger,
 * content-driven height. A sticky stack on a phone would eat the whole screen.
 */

export function FlowStickyStack({ className }: { className?: string }) {
  const isDesktop = useIsDesktop();
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const contextRef = React.useRef<gsap.Context | null>(null);

  React.useEffect(() => {
    if (!isDesktop) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const section = sectionRef.current;
    if (!section) return;

    gsap.registerPlugin(ScrollTrigger);

    const cards = cardRefs.current.filter(Boolean) as HTMLDivElement[];
    const lastIndex = cards.length - 1;

    contextRef.current = gsap.context(() => {
      cards.forEach((card, index) => {
        if (index === lastIndex) return;

        gsap.to(card, {
          scale: 0.92,
          opacity: 0.45,
          ease: 'none',
          scrollTrigger: {
            trigger: cards[index + 1],
            start: 'top bottom',
            end: 'top top',
            scrub: true,
          },
        });

        ScrollTrigger.create({
          trigger: card,
          start: 'top top',
          endTrigger: cards[lastIndex],
          end: 'top top',
          pin: true,
          pinSpacing: false,
        });
      });
    }, section);

    return () => {
      contextRef.current?.revert();
      contextRef.current = null;
    };
  }, [isDesktop]);

  return (
    <div ref={sectionRef} className={cn(className)}>
      {STAGES.map((stage, index) => (
        <div
          key={stage.id}
          ref={(element) => {
            cardRefs.current[index] = element;
          }}
        >
          <FlowStageCard
            stage={stage}
            // Pinning is a desktop-only affordance; the mobile list must not
            // reserve viewport height per card.
            compact={!isDesktop}
          />
        </div>
      ))}
    </div>
  );
}