'use client';

import * as React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/hooks/use-media-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PANELS = [
  {
    id: 'preschool',
    trigger: 'Preschool',
    title: 'Milestones, not grades.',
    body: 'Observation notes turn into a running record of what a child can do now and what comes next, so a parent conversation starts from evidence.',
    points: [
      'Observation log tied to a milestone',
      'Photo evidence attached to a note',
      'Family updates in plain language',
    ],
  },
  {
    id: 'k12',
    trigger: 'K-12',
    title: 'Standards in, mastery out.',
    body: 'Each assessment maps to a standard, and mastery is computed per student per standard rather than one number per class.',
    points: [
      'Standards mapping on every question',
      'Mastery view per student per standard',
      'Interventions flagged before they stall',
    ],
  },
  {
    id: 'university',
    trigger: 'University',
    title: 'Credits and GPA, in context.',
    body: 'Assessments carry weight, so a single exam is never mistaken for the whole grade, and the term view shows where a student actually stands.',
    points: [
      'Weighted assessment categories',
      'Credits tracked against requirements',
      'Degree audit visible to the student',
    ],
  },
];

/**
 * Roles. A GSAP horizontal pan on desktop, a tab set on mobile.
 *
 * Canonical skeleton: the wrapper pins, the inner track scrubs, and `end` is
 * computed from the track's actual scroll width so the pan ends exactly when the
 * last panel is fully in view. `invalidateOnRefresh` keeps that distance
 * correct after a resize.
 *
 * The track is padded to the page gutter rather than starting at the viewport
 * edge, so the first panel lines up with every other heading on the page, and
 * `distance` accounts for that padding. Getting this wrong is what makes a pan
 * read as broken content spilling off the screen instead of a deliberate slide.
 *
 * Arrow keys move between panels, because a scroll-driven pan that only responds
 * to a wheel is unusable by keyboard.
 */
export function RolesPan({ className }: { className?: string }) {
  const isDesktop = useIsDesktop();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const contextRef = React.useRef<gsap.Context | null>(null);
  const [active, setActive] = React.useState('preschool');

  React.useEffect(() => {
    if (!isDesktop) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const wrapper = wrapperRef.current;
    const track = trackRef.current;
    if (!wrapper || !track) return;

    gsap.registerPlugin(ScrollTrigger);

    // The track starts one gutter in, so it must travel a gutter less than its
    // raw overflow or the final panel stops short of the right-hand margin.
    const distance = () =>
      Math.max(0, track.scrollWidth - window.innerWidth);

    contextRef.current = gsap.context(() => {
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: wrapper,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
    }, wrapper);

    return () => {
      contextRef.current?.revert();
      contextRef.current = null;
    };
  }, [isDesktop]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const index = PANELS.findIndex((panel) => panel.id === active);
    const next = (index + step + PANELS.length) % PANELS.length;
    setActive(PANELS[next].id);

    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const travelled =
      wrapper.scrollWidth - wrapper.clientWidth || document.documentElement.scrollWidth;
    window.scrollBy({
      top: (travelled / (PANELS.length - 1)) * step,
      behavior: 'smooth',
    });
  };

  if (!isDesktop) {
    return (
      <div className={className}>
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="w-full justify-start overflow-x-auto">
            {PANELS.map((panel) => (
              <TabsTrigger key={panel.id} value={panel.id}>
                {panel.trigger}
              </TabsTrigger>
            ))}
          </TabsList>
          {PANELS.map((panel) => (
            <TabsContent key={panel.id} value={panel.id} className="mt-6">
              <RolePanel panel={panel} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn('pan-bleed overflow-hidden', className)}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="LIKO by level"
    >
      <div
        ref={trackRef}
        className="pan-track flex will-change-transform"
      >
        {PANELS.map((panel) => (
          <div key={panel.id} className="pan-item">
            <RolePanel panel={panel} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RolePanel({
  panel,
}: {
  panel: (typeof PANELS)[number];
}) {
  return (
    <article className="pan-card rounded-[16px] border border-border bg-surface p-6 shadow-[var(--shadow-sm)] md:p-9">
      <p className="text-label text-accent">{panel.trigger}</p>
      <h3 className="text-h3 mt-3">{panel.title}</h3>
      <p className="measure mt-4 text-body">{panel.body}</p>
      <ul className="mt-6 space-y-2.5">
        {panel.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
            />
            <span className="text-[0.9375rem] text-ink-muted">{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}