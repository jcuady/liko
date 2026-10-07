import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketingNav } from '@/components/layout/MarketingNav';
import { getSession } from '@/lib/auth/guards';
import { PricingTiers } from './components/PricingTiers';
import { PriceComparison } from './components/PriceComparison';
import { BillingFaq } from './components/BillingFaq';
import { PricingFooter } from './components/PricingFooter';

const TITLE = 'LIKO pricing. One plan per teacher, not per student.';
const DESCRIPTION =
  'Start free on one class. Move to a paid plan only when you need a second one. A monthly and annual rate for every plan, with what each one includes written out.';

export function generateMetadata(): Metadata {
  return {
    title: 'Pricing that fits one teacher or a whole staff.',
    description: DESCRIPTION,
    alternates: { canonical: '/pricing' },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: '/pricing',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  };
}

export default async function PricingPage() {
  // Same rule as the landing page: a signed-in visitor belongs in the
  // workspace, not reading a sales page about the workspace.
  const session = await getSession();
  if (session) redirect('/overview');

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable left-4 top-4 z-50 rounded-[8px] bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent"
      >
        Skip to content
      </a>

      <MarketingNav />

      <main id="main" className="overflow-x-hidden">
        <section className="pb-2 pt-14 md:pt-20">
          <div className="container-marketing">
            <p className="text-label">Pricing</p>

            <h1 className="text-display mt-5 max-w-[16ch]">
              You pay for the teacher. Never for the student.
            </h1>

            <p className="measure mt-6 text-lead">
              Start free on one class and move up only when you need a second
              one. Every plan runs the same workspace, so nothing you have
              already set up gets thrown away when you change tier.
            </p>
          </div>
        </section>

        <PricingTiers />
        <PriceComparison />
        <BillingFaq />
      </main>

      <PricingFooter />
    </>
  );
}