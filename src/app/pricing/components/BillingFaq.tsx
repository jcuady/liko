'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from '@/app/(marketing)/components/SectionHeader';
import { Reveal } from '@/app/(marketing)/components/Reveal';

/**
 * Billing questions only.
 *
 * The landing FAQ already answers the product questions, so repeating them here
 * would just be a second place to fall out of date. What a pricing page has to
 * answer on its own is what gets charged, when, and what happens to the data.
 *
 * Single-open accordion, and the list reveals as one block: staggering the rows
 * would make a reader wait out a queue of motion before they could open the
 * question they came for.
 */

const ITEMS = [
  {
    q: 'What is the difference between the trial and the free plan?',
    a: 'The trial runs the paid workspace on your own classes while you decide. When it ends you move to the free Starter plan unless you pick a paid one. No card is needed to begin, and nothing is charged until you choose a plan.',
  },
  {
    q: 'Do you charge per student?',
    a: 'No. A Teacher plan covers you and every student in every class you run, so a class of thirty costs the same as a class of twelve. School plans are charged per teacher on the staff list, not per student.',
  },
  {
    q: 'When am I charged?',
    a: 'Monthly billing charges on the same day each month. Annual billing charges once for the year at the rate shown, which works out lower per month. Nothing is charged during a trial.',
  },
  {
    q: 'Can I move between plans, or cancel?',
    a: 'Any time, from your settings, with no support ticket. Annual billing is charged for the year you bought, so the sooner you decide the less you have paid for. Your data stays exportable afterwards, so cancelling does not mean losing it.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Export any class, gradebook, or student history as CSV or JSON whenever you need it, before you cancel or after. Nothing about your classes is locked behind a paid plan.',
  },
];

export function BillingFaq() {
  return (
    <section
      id="billing"
      aria-labelledby="billing-title"
      className="chapter border-t border-border"
    >
      <div className="container-marketing">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <SectionHeader
                label="Billing"
                id="billing-title"
                title="What you are agreeing to."
              />
            </div>
          </div>

          <div className="lg:col-span-8">
            <Reveal>
              <Accordion type="single" collapsible defaultValue="item-0">
                {ITEMS.map((item, index) => (
                  <AccordionItem key={item.q} value={`item-${index}`}>
                    <AccordionTrigger>{item.q}</AccordionTrigger>
                    <AccordionContent>{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}