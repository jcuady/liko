'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, LayoutDashboard, Presentation, ScanLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SHOWCASE_TABS, type SampleTab } from './sample-class';
import { WorkspaceMock } from './WorkspaceMock';

/**
 * The features section: one mock you can turn over, and three things it does.
 *
 * The tab strip is the point. A screenshot shows one screen and makes the reader
 * imagine the rest; letting them switch four of them says the product has four
 * rooms without a word of copy doing the work.
 *
 * The three items are numbered, which is the design's own device and is kept
 * because it reads as a sequence rather than as a heading. Each links into the
 * real product, not the mock, because the mock is a picture.
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
  href: string;
}[] = [
  {
    number: '01 / CREATE',
    title: 'Great lessons. Less prep.',
    copy: 'Turn your ideas into classroom-ready presentations. Make space for engaging lessons, without starting from a blank slide.',
    label: 'Meet your lesson studio',
    href: '/overview',
  },
  {
    number: '02 / UNDERSTAND',
    title: 'Every student, seen.',
    copy: 'Keep grades organized and see the story behind the numbers. Know who’s thriving, and who needs a little more support.',
    label: 'Get the whole picture',
    href: '/overview',
  },
  {
    number: '03 / ASSESS',
    title: 'Less marking. More meaning.',
    copy: 'Create online or printable quizzes. With scan-to-score, paper assessments become insights you can actually act on.',
    label: 'Meet your quiz maker',
    href: '/overview',
  },
] as const;

export function FeaturesShowcase() {
  const [tab, setTab] = React.useState<SampleTab>('gradebook');

  return (
    <section className="section page-frame" id="features" aria-labelledby="features-heading">
      <div className="section-heading">
        <p className="section-tag">A calmer day starts here</p>
        <h2 className="section-title">
          <span id="features-heading">One workspace. A world of possibilities.</span>
        </h2>
        <p className="section-copy">
          From your first lesson to your last graded paper, Liko brings
          <br className="desktop-only" />
          everything you need into one thoughtfully simple space.
        </p>
      </div>

      <div className="demo-tabs" role="tablist" aria-label="Explore Liko features">
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
              data-active={active}
              onClick={() => setTab(item.id)}
            >
              <Icon size={14} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        className="showcase-frame"
        id="feature-panel"
        role="tabpanel"
        aria-labelledby={`feature-tab-${tab}`}
      >
        <WorkspaceMock tab={tab} onTabChange={setTab} className="min-h-[450px]" />

        <div className="showcase-footer">
          <p>Your next great teaching day, all in one place.</p>
          <Button asChild variant="link">
            <Link href="/register">
              Explore the demo
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="feature-grid">
        {FEATURES.map((feature) => (
          <article key={feature.number} className="feature-item">
            <span className="feature-number">{feature.number}</span>
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
            <Link href={feature.href}>{feature.label}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}