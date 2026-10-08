import { SectionHeader } from './SectionHeader';
import { Reveal } from './Reveal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * FAQ. Single-open accordion, fully keyboard operable.
 *
 * The first question answers the trial question directly. The hero deliberately
 * carries no reassurance microcopy, so this is where that promise lives.
 */

const ITEMS = [
  {
    q: 'What does the free trial include?',
    a: 'The full workspace, on your own classes, for as long as the trial runs. No credit card is needed to begin, and nothing is charged until you choose a plan. Setup takes about two minutes.',
  },
  {
    q: 'Does it work without a signal?',
    a: 'Yes. LIKO is a progressive web app. Attendance and grades you enter without a connection are queued on the device and synced when you are back online, with a visible queue count so nothing looks lost.',
  },
  {
    q: 'Can I bring my existing class list in?',
    a: 'Yes. Import from a spreadsheet, or connect an LMS. Import maps your existing columns onto LIKO terms, and nothing is overwritten during the import.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Always, in a format you can open without us. Export any class, gradebook, or student history as CSV or JSON at any time, including from a trial.',
  },
  {
    q: 'How does LIKO handle student data?',
    a: 'LIKO is built around FERPA-aligned handling and COPPA-aware defaults for K-12. Access is role-scoped so a teacher sees only their own classes. We do not use student data to train third-party models. See docs/SECURITY.md for the current posture, including what is implemented and what is still planned.',
  },
  {
    q: 'Can our whole school use it?',
    a: 'Yes. Department heads and administrators can see across every class they administer, and manage staff accounts, without being able to read a class they do not teach.',
  },
  {
    q: 'What happens to my data if I use AI features?',
    a: 'Anything you explicitly send is scoped to that request. Student records are never included in a model prompt unless you attach them yourself, and the request log is visible to you.',
  },
  {
    q: 'Can I cancel?',
    a: 'At any time, from your settings, with no support ticket. Your data stays exportable afterwards, so cancelling does not mean losing it.',
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="chapter">
      <div className="container-marketing">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <SectionHeader
                label="Questions"
                id="faq-title"
                title="The things people actually ask."
              />
            </div>
          </div>

          <div className="lg:col-span-8">
            {/*
              The list reveals as one block. Staggering eight accordion rows
              would make a reader wait through a queue of motion before they
              could even open a question, and the accordion is interactive the
              moment it lands.
            */}
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