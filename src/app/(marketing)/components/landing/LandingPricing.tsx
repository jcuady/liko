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
  priceNote,
  type Cycle,
} from '@/app/pricing/plans';

/**
 * The landing page's pricing section, rendered from the same data as /pricing.
 *
 * THE DESIGN HAD ITS OWN PRICES AND ITS OWN DISCLAIMER. Three cards with peso
 * figures and a caption reading "Illustrative MVP pricing. No purchase or
 * subscription is activated in this demo", because in the prototype there was
 * nothing behind them.
 *
 * That data is not copied. It reads `PLANS` from the pricing page, so there is
 * exactly one list of plans in the product and a change to a price reaches both
 * pages. Every card links to `/register?plan=<id>`, the same link the pricing
 * page uses, which is what `e2e/legal.spec.ts` checks are all legal ids.
 */

const CYCLES: readonly { id: Cycle; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'annual', label: 'Yearly' },
] as const;

/** The largest saving any plan offers, so the badge cannot disagree with the cards. */
const BEST_SAVING = Math.max(
  ...PLANS.map((plan) =>
    plan.monthly <= 0 ? 0 : Math.round(((plan.monthly - plan.annual) / plan.monthly) * 100),
  ),
);

const DESCRIPTIONS = [
  'A fresh start for your classroom.',
  'More possibility. Less busywork.',
  'Better together, across your school.',
] as const;

export function LandingPricing() {
  const [cycle, setCycle] = React.useState<Cycle>('monthly');

  return (
    <section className="section page-frame" id="pricing" aria-labelledby="pricing-heading">
      <div className="section-heading">
        <p className="section-tag">A small investment. A bigger impact.</p>
        <h2 className="section-title">
          <span id="pricing-heading">Made for teachers. Priced for you.</span>
        </h2>
        <p className="section-copy">
          Start for free. Grow when you’re ready.
          <br />
          Simple plans, in Philippine pesos.
        </p>
      </div>

      <div className="pricing-switch">
        <div className="pricing-toggle" role="group" aria-label="Billing period">
          {CYCLES.map((option) => (
            <button
              key={option.id}
              type="button"
              data-active={option.id === cycle}
              aria-pressed={option.id === cycle}
              onClick={() => setCycle(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="save-label">Save {BEST_SAVING}% with yearly</span>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan, index) => {
          const amount = priceFor(plan, cycle);
          const featured = Boolean(plan.recommended);

          return (
            <article key={plan.id} className={`price-card${featured ? ' featured' : ''}`}>
              {featured ? <span className="popular-label">Teacher favorite</span> : null}

              <h3>{plan.name}</h3>
              <p className="price-description">{DESCRIPTIONS[index] ?? plan.blurb}</p>

              <div className="price-amount">
                {formatPrice(amount)}
                <span> / month</span>
              </div>

              <p className="billing-note">{priceNote(plan, cycle)}</p>

              <Button asChild variant={featured ? 'primary' : 'secondary'} size="cta" block>
                <Link href={`/register?plan=${plan.id}`}>
                  {plan.cta}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="price-disclaimer">{EARLY_ACCESS}</p>
    </section>
  );
}