import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketingNav } from '@/components/layout/MarketingNav';
import { Footer } from '@/components/layout/Footer';
import { Hero } from './components/hero/Hero';
import { StatsBand } from './components/StatsBand';
import { TrustMarquee } from './components/trust/TrustMarquee';
import { Problem } from './components/Problem';
import { FlowSection } from './components/flow/FlowSection';
import { RolesSection } from './components/roles/RolesSection';
import { ModuleBento } from './components/ModuleBento';
import { Proof } from './components/Proof';
import { Faq } from './components/Faq';
import { FinalCta } from './components/FinalCta';
import { getSession } from '@/lib/auth/guards';

const TITLE = 'LIKO. Every teaching task, in one flow.';
const DESCRIPTION =
  'Plan, create, assess, grade, and analyze on a single thread. Built for teachers who are done retyping the same data into four tools.';

export function generateMetadata(): Metadata {
  return {
    title: 'Every teaching task, in one flow.',
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
    name: 'LIKO',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    description: DESCRIPTION,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
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
        the other axis to `auto` and makes this a scroll container, and both
        scroll narratives pin their content with `position: sticky`, which
        resolves against the nearest scrollport. A scrollport that never scrolls
        means sticky never sticks. Clip still suppresses the horizontal overflow
        without creating a scroll container.
      */}
      <main id="main" className="overflow-x-clip">
        {/*
          Section order. The quantified proof used to sit in the seventh
          section, so the strongest argument on the page only reached the reader
          willing to scroll past two scroll narratives to find it. `StatsBand`
          now runs directly under the hero. Every other section keeps the order
          it already had.
        */}
        <Hero />
        <StatsBand />
        <TrustMarquee />
        <Problem />
        <FlowSection />
        <RolesSection />
        <ModuleBento />
        <Proof />
        <Faq />
        <FinalCta />
      </main>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}