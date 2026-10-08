'use client';

import * as React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

import { cn } from '@/lib/utils';
import { useIsDesktop, usePrefersReducedMotion } from '@/lib/hooks/use-media-query';
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
 * Roles. A scroll-driven horizontal pan on desktop, a tab set on mobile.
 *
 * Canonical skeleton: the panel row pins, the inner track is scrubbed sideways,
 * and the pan travels exactly as far as the track actually overflows, so it
 * ends when the last panel is fully in view rather than somewhere past it.
 *
 * That distance is measured, not assumed, because three panels at a fixed width
 * overflow by a different amount at every breakpoint. The measurement feeds two
 * things that have to agree: the track's `x`, and the height of the runway
 * spacer below the pinned panel row. If they disagree the pan either runs past
 * the last panel or stops short of it, which is what makes a pan read as broken
 * content spilling off the screen instead of a deliberate slide.
 *
 * The runway spacer is why the scroll area is at least a viewport tall: that
 * makes the area's scrollable range equal the measured overflow, so the scrub
 * completes exactly as the pinned row reaches the end of its travel.
 *
 * The pinned row is `position: sticky`, so the hold is resolved by the
 * compositor rather than by a scroll handler rewriting layout every frame.
 *
 * Arrow keys move between panels, because a scroll-driven pan that only responds
 * to a wheel is unusable by keyboard.
 */
export function RolesPan({ className }: { className?: string }) {
  const isDesktop = useIsDesktop();
  const reduceMotion = usePrefersReducedMotion();
  const areaRef = React.useRef<HTMLDivElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState('preschool');
  const [distance, setDistance] = React.useState(0);

  // Reduced motion keeps the same panel row, unscrubbed and natively
  // scrollable, so all three panels stay reachable instead of being clipped.
  const pan = isDesktop && !reduceMotion;

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || !pan) {
      setDistance(0);
      return;
    }

    // The track starts one gutter in, so it must travel a gutter less than its
    // raw overflow or the final panel stops short of the right-hand margin.
    const measure = () => {
      const next = Math.max(0, track.scrollWidth - window.innerWidth);
      setDistance((current) => (Math.abs(current - next) < 1 ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pan]);

  const { scrollYProgress } = useScroll({
    target: areaRef,
    offset: ['start start', 'end end'],
  });

  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const index = PANELS.findIndex((panel) => panel.id === active);
    const next = (index + step + PANELS.length) % PANELS.length;
    setActive(PANELS[next].id);

    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';

    if (pan) {
      window.scrollBy({
        top: (distance / (PANELS.length - 1)) * step,
        behavior,
      });
      return;
    }

    wrapperRef.current?.scrollBy({
      left: (trackRef.current?.scrollWidth ?? 0) / PANELS.length * step,
      behavior,
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
    <div ref={areaRef} className={cn(pan && 'min-h-dvh')}>
      <div
        ref={wrapperRef}
        className={cn(
          'pan-bleed',
          pan ? 'sticky top-0 overflow-hidden' : 'overflow-x-auto',
          className,
        )}
        onKeyDown={onKeyDown}
        role="group"
        aria-label="LIKO by level"
      >
        <motion.div
          ref={trackRef}
          style={pan ? { x } : undefined}
          className="pan-track flex will-change-transform"
        >
          {PANELS.map((panel) => (
            <div key={panel.id} className="pan-item">
              <RolePanel panel={panel} />
            </div>
          ))}
        </motion.div>
      </div>

      {/*
        The runway. Gives the pinned row exactly as much scroll as the track
        overflows by, so the scrub and the hold always finish together.
      */}
      {pan && distance > 0 ? (
        <div aria-hidden="true" style={{ height: distance }} />
      ) : null}
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