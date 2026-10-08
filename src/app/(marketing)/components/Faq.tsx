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

/**
 * REWRITTEN, because four of the seven answers were fiction.
 *
 * This list used to describe a time-limited free trial, importing a class list
 * from a spreadsheet or an LMS, exporting any class as CSV or JSON, an AI
 * feature that scoped student records to a single request, and cancelling from
 * settings. None of those exist in the product. There is no trial, no import,
 * no export, no AI feature and no cancellation flow.
 *
 * The questions are the ones a teacher actually asks, so they stay. The answers
 * say what is true, including where the honest answer is "not yet, ask us".
 * A landing page is the one place on the site that cannot afford to be
 * aspirational, because it is what a visitor decides on.
 */
const ITEMS = [
  {
    q: 'What does it cost?',
    a: 'Nothing right now. LIKO is in early access: every feature is free, no card is taken when you sign up, and there is no end date. We will tell you before billing opens.',
  },
  {
    q: 'Does it work without a signal?',
    a: 'Yes. LIKO is a progressive web app. Attendance and grades you enter without a connection are queued on the device and synced when you are back online, with a visible queue count so nothing looks lost.',
  },
  {
    q: 'Can I bring my existing class list in?',
    a: 'Not yet. There is no spreadsheet or LMS import today, and students are added one at a time from the class roster. If that is what is stopping you, say so and you will be told the moment it lands.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Your classes, gradebooks and student history are yours, and we will get them out for you. There is no self-service export button yet, so write to us and we will arrange it rather than have you discover the gap when you need it.',
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
    q: 'Do students get their own accounts?',
    a: 'No. A teacher creates a login for a student or guardian from the class roster, so an account always belongs to a class, a teacher and a school. Students cannot sign themselves up, which is how we keep the link between a child and a school record checkable.',
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