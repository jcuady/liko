'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Reveal } from '@/app/(marketing)/components/Reveal';
import { SectionHeader } from '@/app/(marketing)/components/SectionHeader';
import { PLANS, priceFor, priceNote, savingPercent, type Cycle } from '../plans';

/**
 * Pricing tiers.
 *
 * The monthly and annual switch is real state, not a decoration over a single
 * set of numbers. Each rate lives in `plans.ts` and the toggle chooses between
 * them, the line under the price is recomputed from the same two figures, and
 * the saving badge is derived rather than typed, so it cannot drift out of
 * agreement with the cards.
 *
 * Annual is the default because a teacher buying a year is the common case, but
 * it is never hidden: the label says what the number is per month and the line
 * underneath spells out the yearly total.
 */

const CYCLES: { id: Cycle; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'annual', label: 'Annual' },
];

function formatPrice(value: number): string {
  return `$${value}`;
}

export function PricingTiers() {
  const [cycle, setCycle] = React.useState<Cycle>('annual');

  // Taken from a real plan so the badge and the cards cannot disagree.
  const saving = Math.max(...PLANS.map(savingPercent));

  return (
    <section id="tiers" aria-labelledby="tiers-title" className="chapter">
      <div className="container-marketing">
        <SectionHeader
          label="Plans"
          id="tiers-title"
          title="Pay for the teacher. Never for the student."
        >
          <p className="measure text-lead">
            Every plan runs the same workspace, so nothing you have already set
            up gets thrown away when you move between them.
          </p>
        </SectionHeader>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex rounded-[12px] border border-border bg-surface p-1"
          >
            {CYCLES.map((option) => {
              const active = cycle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCycle(option.id)}
                  className={`rounded-[8px] px-4 py-2 text-[0.9375rem] font-medium transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? 'bg-accent text-on-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {saving > 0 ? (
            <span className="rounded-[8px] bg-accent-subtle px-2.5 py-1.5 text-[0.8125rem] font-medium text-accent">
              Annual billing saves {saving}%
            </span>
          ) : null}

          {/* The price changes silently otherwise, so it says what changed. */}
          <span className="sr-only" aria-live="polite">
            {cycle === 'annual'
              ? `Annual billing shown. Save ${saving}%.`
              : 'Monthly billing shown.'}
          </span>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 0.07} className="h-full">
              <article
                className={`flex h-full flex-col rounded-[16px] border bg-surface p-7 shadow-sm ${
                  plan.recommended ? 'border-accent' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-h4">{plan.name}</h3>
                  {plan.recommended ? (
                    <span className="shrink-0 rounded-[8px] bg-accent-subtle px-2.5 py-1 text-[0.75rem] font-medium text-accent">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-[0.9375rem] text-ink-muted">{plan.audience}</p>

                <p className="mt-7 flex items-baseline gap-2">
                  <span className="tabular text-[2.75rem] font-semibold leading-none tracking-[-0.03em] text-ink">
                    {formatPrice(priceFor(plan, cycle))}
                  </span>
                  <span className="text-[0.875rem] text-ink-muted">{plan.unit}</span>
                </p>

                {/*
                  Reserved height, so the card does not jump when the cycle
                  switches and the sentence underneath changes length.
                */}
                <p className="mt-3 min-h-[3.2rem] text-[0.875rem] leading-relaxed text-ink-muted">
                  {priceNote(plan, cycle)}
                </p>

                <p className="mt-6 text-[0.9375rem] leading-relaxed text-ink">
                  {plan.blurb}
                </p>

                <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-3 text-[0.9375rem] leading-snug text-ink-muted"
                    >
                      <CheckIcon
                        size={16}
                        weight="bold"
                        aria-hidden="true"
                        className="mt-[0.2rem] shrink-0 text-accent"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <Button
                    asChild
                    block
                    size="lg"
                    variant={plan.recommended ? 'primary' : 'secondary'}
                  >
                    <Link href={`/register?plan=${plan.id}`}>{plan.cta}</Link>
                  </Button>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="mt-10">
          <Button asChild variant="link" size="sm">
            <a href="#compare">Read the full comparison</a>
          </Button>
        </p>
      </div>
    </section>
  );
}