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
 * Pricing questions only.
 *
 * The landing FAQ already answers the product questions, so repeating them here
 * would just be a second place to fall out of date. What a pricing page has to
 * answer on its own is what gets charged, when, and what happens to the data.
 *
 * REWRITTEN. Every answer here used to describe a subscription system: a trial
 * with an end date, monthly charges, a cancellation button in settings, annual
 * refunds, and a CSV export of any class. None of that exists. There is no
 * billing, no trial, no cancellation flow and no export. A reader who trusted
 * this section would have gone looking for a button that is not there.
 *
 * So the section now answers the questions that have real answers, and says
 * plainly when something does not exist yet rather than describing it warmly.
 *
 * Single-open accordion, and the list reveals as one block: staggering the rows
 * would make a reader wait out a queue of motion before they could open the
 * question they came for.
 */

const ITEMS = [
  {
    q: 'What does it cost right now?',
    a: 'Nothing. LIKO is in early access, every plan is free, and no card is taken when you sign up. The prices shown on this page are what each plan will cost when billing opens, and we will tell you before that happens.',
  },
  {
    q: 'Will I be moved onto a paid plan automatically?',
    a: 'No. When billing opens we will ask you to choose, and say what it costs. Nothing will be charged to an account that has not agreed to a price, and you can stay on the free tier if you would rather.',
  },
  {
    q: 'Do you charge per student?',
    a: 'No, and that will not change. A class of thirty costs the same as a class of twelve, because the work being done is the same. Where a school plan charges per teacher, it is charged per teacher on the staff list, never per student.',
  },
  {
    q: 'Can I move between plans later?',
    a: 'Once plans do anything, moving to a lower one takes effect at your next renewal so a term you have already paid for is not cut short, and moving to a higher one takes effect immediately. Until then there is nothing to move between, because the plans cost the same.',
  },
  {
    q: 'What happens to my data if I leave?',
    a: 'Write to us and we will help you get your classes, gradebooks and student history out of LIKO first, then delete what is left. There is no self-service export button yet, so please ask rather than assuming one is there.',
  },
  {
    q: 'Is anything locked behind a paid plan?',
    a: 'No. Right now every feature in LIKO is available to every teacher on every plan, which is the point of early access: you should not have to pay to find out whether the thing is any good.',
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
                label="Pricing"
                id="billing-title"
                title="What you pay, and when."
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