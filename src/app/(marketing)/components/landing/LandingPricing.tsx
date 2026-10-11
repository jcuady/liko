'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  EARLY_ACCESS,
  PLANS,
  formatPrice,
  priceFor,
  type Cycle,
} from '@/app/pricing/plans';
import { cn } from '@/lib/utils';
import { SectionHeading } from '@/components/marketing/SectionHeading';

/**
 * The landing page's pricing section, rendered from the same data as /pricing.
 *
 * THE DESIGN HAD ITS OWN PRICES. Three cards with peso figures and a caption
 * reading "Illustrative MVP pricing. No purchase or subscription is activated in
 * this demo", because in the prototype there was nothing behind them.
 *
 * That data is not copied. It reads `PLANS` from the pricing page, so there is
 * exactly one list of plans in the product and a change to a price reaches both
 * pages. Every card links to `/register?plan=<id>`, the same link the pricing
 * page uses, which is what `e2e/legal.spec.ts` checks are all legal ids.
 *
 * The annual figure is described honestly. A plan is charged once a year at the
 * annual rate, so the note says so rather than implying a monthly charge that is
 * not made.
 */

const CYCLES: readonly { id: Cycle; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'annual', label: 'Yearly' },
] as const;

export function LandingPricing() {
  const [cycle, setCycle] = React.useState<Cycle>('monthly');
  const annual = cycle === 'annual';

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="chapter">
      <SectionHeading
        eyebrow="A small investment. A bigger impact."
        title={<span id="pricing-heading">Made for teachers. Priced for you.</span>}
        copy="Start at no cost. Grow when you are ready. Plans are quoted in Philippine pesos, and no card is taken."
      />

      <div className="my-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <div
          role="group"
          aria-label="Billing period"
          className="flex rounded-full border border-border bg-surface-sunken p-1"
        >
          {CYCLES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCycle(option.id)}
              aria-pressed={option.id === cycle}
              className={cn(
                'min-h-11 rounded-full px-4 text-[12px] lg:min-h-0 lg:h-9',
                option.id === cycle
                  ? 'bg-surface-raised text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-accent">Two months free on yearly</span>
      </div>

      <ul className="grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const amount = priceFor(plan, cycle);
          const featured = Boolean(plan.recommended);

          return (
            <li
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-[8px] border p-7',
                featured ? 'border-accent bg-accent-subtle' : 'border-border bg-surface-raised',
              )}
            >
              {featured ? (
                <span className="absolute right-5 top-6 text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
                  Teacher favorite
                </span>
              ) : null}

              <h3 className="mb-2 text-[18px]">{plan.name}</h3>
              <p className="min-h-[22px] text-[12px] text-ink-muted">{plan.blurb}</p>

              <p className="my-4 font-display text-[42px] font-semibold leading-none">
                {formatPrice(amount)}
                <span className="font-sans text-[12px] font-normal text-ink-muted">
                  {' '}
                  / month
                </span>
              </p>

              <p className="mb-6 min-h-[16px] text-[10px] text-ink-muted">
                {plan.unit === 'forever'
                  ? 'Free, for as long as you need.'
                  : annual
                    ? `Charged ${formatPrice(amount * 12)} once a year.`
                    : 'Charged every month. Leave whenever you like.'}
              </p>

              <Button asChild variant={featured ? 'primary' : 'secondary'} size="cta" block>
                <Link href={`/register?plan=${plan.id}`}>
                  {plan.cta}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>

              <ul className="mt-5 grid list-none gap-3.5 border-t border-border p-0 pt-5 text-[12px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={13} className="mt-1 flex-none text-accent" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-6 max-w-[640px] text-center text-[11px] leading-relaxed text-ink-muted">
        {EARLY_ACCESS}
      </p>
    </section>
  );
}