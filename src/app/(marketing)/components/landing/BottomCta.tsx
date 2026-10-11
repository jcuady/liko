import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The closing band, on the forest panel.
 *
 * The last thing on the page is the same ask as the first thing on the page,
 * which is the design's decision and a deliberate one: a visitor who scrolled
 * all the way here has already decided, and a different call to action at the
 * bottom would be asking them to reconsider.
 */

export function BottomCta() {
  return (
    <section className="forest-panel forest-grid overflow-hidden">
      <div className="relative z-10 px-5 py-20 text-center md:py-28">
        <p className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-highlight">
          Less on your plate. More in their future.
        </p>
        <h2
          id="bottom-cta-title"
          className="mx-auto mb-4 max-w-[640px] text-[clamp(1.8rem,4vw,2.375rem)] font-semibold leading-[1.22] text-balance"
        >
          Make room for the teaching you love.
        </h2>
        <p className="mx-auto mb-8 max-w-[480px] text-[15px] opacity-70">
          Your next great classroom moment starts with a little Liko.
        </p>

        <Button asChild variant="hero" size="cta">
          <Link href="/register">
            Get started for free
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}