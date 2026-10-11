import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketingNav } from '@/components/layout/MarketingNav';
import { Footer } from '@/components/layout/Footer';
import { getSession } from '@/lib/auth/guards';

import { Hero } from './components/landing/Hero';
import { TeacherLevels } from './components/landing/TeacherLevels';
import { FeaturesShowcase } from './components/landing/FeaturesShowcase';
import { TeacherStory } from './components/landing/TeacherStory';
import { MobileBand } from './components/landing/MobileBand';
import { LandingPricing } from './components/landing/LandingPricing';
import { Faq } from './components/landing/Faq';
import { BottomCta } from './components/landing/BottomCta';

/**
 * The landing page, rebuilt on the supplied brand design.
 *
 * THE ORDER IS THE DESIGN'S, AND IT IS THE BETTER ONE. The previous page ran a
 * hero, a stats band, a logo marquee, a problem statement, two scroll narratives,
 * a roles pan and a proof carousel before a visitor saw a price or a way to
 * start. This one reaches the workspace at the first screen, the three things
 * the product does at the second, and the price at the fourth.
 *
 * WHY PRICING IS ON THE LANDING PAGE NOW. The design puts three plan cards
 * between the features and the questions. They render from the same `PLANS`
 * array `/pricing` renders from and link to the same `/register?plan=` URLs, so
 * there is still one list of plans in the product.
 */

const TITLE = 'Liko. Less admin. More teaching.';
const DESCRIPTION =
  'Meet Liko. Your lessons, grades, quizzes and student insights, finally together. Built for preschool, grade school, high school and college teachers, with plans in Philippine pesos.';

export function generateMetadata(): Metadata {
  return {
    /*
     * No trailing full stop. The root layout appends ". LIKO" to every title
     * that does not override the template, so a title ending in a period
     * rendered as "Less admin. More teaching.. LIKO" in the tab and in the
     * search result. `src/lib/metadata.test.ts` holds the line.
     */
    title: 'Less admin. More teaching',
    description: DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: '/',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  };
}

export default async function LandingPage() {
  // A signed-in visitor has no business on the marketing page.
  const session = await getSession();
  if (session) redirect('/overview');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Liko',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    description: DESCRIPTION,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'PHP' },
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable left-4 top-4 z-50 rounded-[8px] bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent"
      >
        Skip to content
      </a>

      <MarketingNav />

      {/*
        `overflow-x-clip`, not `overflow-x-hidden`. The hidden variant computes
        the other axis to `auto` and makes this a scroll container, and the
        sticky nav inside it resolves against the nearest scrollport. A scrollport
        that never scrolls means sticky never sticks.
      */}
      <main id="main" className="overflow-x-clip">
        <Hero />
        <TeacherLevels />
        <FeaturesShowcase />
        <TeacherStory />
        <MobileBand />
        <LandingPricing />
        <Faq />
        <BottomCta />
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}