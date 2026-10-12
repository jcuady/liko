import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The closing band.
 *
 * The last thing on the page is the same ask as the first thing on the page,
 * which is the design's decision and a deliberate one: a visitor who scrolled
 * all the way here has already decided, and a different call to action at the
 * bottom would be asking them to reconsider.
 */

export function BottomCta() {
  return (
    <section className="bottom-cta">
      <p className="section-tag">Less on your plate. More in their future.</p>
      <h2 className="section-title" id="bottom-cta-title">
        Make room for the teaching you love.
      </h2>
      <p>Your next great classroom moment starts with a little Liko.</p>

      <Button asChild variant="primary" size="cta">
        <Link href="/register" className="rounded-full">
          Get started for free
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}