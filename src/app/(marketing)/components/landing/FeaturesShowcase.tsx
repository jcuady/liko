'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart3,
  LayoutDashboard,
  Presentation,
  ScanLine,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SHOWCASE_TABS, type SampleTab } from './sample-class';
import { WorkspaceMock } from './WorkspaceMock';
import { SectionHeading } from '@/components/marketing/SectionHeading';

/**
 * The features section: one mock you can turn over, and three things it does.
 *
 * The tab strip is the point of the section. A screenshot shows one screen and
 * makes the reader imagine the rest; letting them switch four of them says the
 * product has four rooms without a word of copy doing the work.
 *
 * The three cards below are numbered, which is the design's device and is kept
 * because it reads as a sequence rather than as a heading. Each one links to the
 * real sign up rather than opening the mock, because the mock is a picture.
 */

const TAB_ICONS: Record<SampleTab, typeof LayoutDashboard> = {
  gradebook: LayoutDashboard,
  lessons: Presentation,
  quizzes: ScanLine,
  insights: BarChart3,
};

const FEATURES: readonly {
  number: string;
  title: string;
  copy: string;
  label: string;
  tab: SampleTab;
}[] = [
  {
    number: '01 / CREATE',
    title: 'Great lessons. Less prep.',
    copy: 'Turn an idea into a classroom ready deck from a prompt you write yourself. Make space for a lesson that lands, without starting from a blank slide.',
    label: 'Meet your lesson studio',
    tab: 'lessons',
  },
  {
    number: '02 / UNDERSTAND',
    title: 'Every student, seen.',
    copy: 'Keep marks organised and see the story behind them. Know who is thriving, and who needs a little more support before it becomes a problem.',
    label: 'Get the whole picture',
    tab: 'insights',
  },
  {
    number: '03 / ASSESS',
    title: 'Less marking. More meaning.',
    copy: 'Build a quiz as a printable handout or an online activity. Scan the completed paper against the answer key and turn it into marks you can act on.',
    label: 'Meet your quiz maker',
    tab: 'quizzes',
  },
] as const;

export function FeaturesShowcase() {
  const [tab, setTab] = React.useState<SampleTab>('gradebook');

  return (
    <section id="features" aria-labelledby="features-heading" className="chapter">
      <SectionHeading
        eyebrow="A calmer day starts here"
        title={
          <span id="features-heading">One workspace. A world of possibilities.</span>
        }
        copy="From your first lesson to your last graded paper, Liko brings everything you need into one thoughtfully simple space."
      />

      <div
        role="tablist"
        aria-label="Explore Liko features"
        className="mx-auto mt-7 flex w-fit max-w-full gap-1 rounded-full border border-border bg-surface-sunken p-1"
      >
        {SHOWCASE_TABS.map((item) => {
          const Icon = TAB_ICONS[item.id];
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`feature-tab-${item.id}`}
              aria-selected={active}
              aria-controls="feature-panel"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] md:px-[19px] lg:min-h-0 lg:h-9',
                active ? 'bg-surface-raised text-accent shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id="feature-panel"
        role="tabpanel"
        aria-labelledby={`feature-tab-${tab}`}
        className="mx-auto mt-6 max-w-[980px] rounded-[12px] border border-border bg-accent-subtle p-3.5"
      >
        <WorkspaceMock tab={tab} onTabChange={setTab} className="min-h-[450px]" />

        <div className="flex items-center justify-between gap-3 px-2 pt-4">
          <p className="max-w-[180px] text-[10px] text-ink-muted md:max-w-none md:text-[11px]">
            Your next great teaching day, all in one place.
          </p>
          <Button asChild variant="link" className="text-[12px] text-accent">
            <Link href="/register">
              Explore it properly
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-11 grid gap-8 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.number} className="border-t border-border pt-5">
            <span className="font-display text-[11px] text-accent">{feature.number}</span>
            <h3 className="my-2.5 text-[18px] font-semibold">{feature.title}</h3>
            <p className="text-[13px] leading-[1.7] text-ink-muted">{feature.copy}</p>
            <Link
              href="/register"
              onClick={() => setTab(feature.tab)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-[12px] font-semibold text-accent lg:min-h-0"
            >
              {feature.label}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}