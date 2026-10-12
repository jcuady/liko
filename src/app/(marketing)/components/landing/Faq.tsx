import Link from 'next/link';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * The questions a school actually asks before signing a teacher up.
 *
 * EVERY ANSWER HERE IS CHECKED AGAINST THE PRODUCT, NOT AGAINST THE DESIGN.
 *
 * The brand prototype shipped this section with the answer "AI generation and
 * PowerPoint file export are not connected yet". That sentence is now wrong in
 * one half and dangerously right in the other. Deck generation from a prompt
 * shipped and works, so claiming it does not exist undersells the product. But
 * `src/app/(dashboard)/slides/actions.ts` says plainly that there is deliberately
 * no `.pptx` import or export, so promising a PowerPoint file would invent a
 * feature the code refuses to build.
 *
 * So the answer states both halves: you can generate and edit a deck in Liko,
 * you present it from Liko or print it to PDF, and there is no PowerPoint file.
 * That is a smaller promise than the prototype's, and it is the one LIKO keeps.
 *
 * `e2e/legal.spec.ts` reads this section's rendered text as a claim, so the
 * wording here is also the thing those guards are protecting.
 */

const QUESTIONS: readonly { question: string; answer: React.ReactNode }[] = [
  {
    question: 'Is Liko right for the grade level I teach?',
    answer:
      'Yes. You can create a class at preschool, K to 12, or university level, and the gradebook grades on percentage, letter, GPA or GWA. The grade levels on this page are the ones the sample class is drawn from.',
  },
  {
    question: 'Can I use Liko for both paper and online quizzes?',
    answer:
      'Yes. Build a quiz once, then run it as a printable handout or an online activity. Scan the completed paper against the answer key and the marks go straight into the gradebook for that class.',
  },
  {
    question: 'Can Liko create PowerPoint presentations?',
    answer:
      'Describe the lesson and Liko drafts a deck of slides you can edit, reorder and restyle yourself. You present from Liko, or print the deck to PDF from the browser. There is no PowerPoint file export, and that is deliberate rather than unfinished.',
  },
  {
    question: 'Do I need a credit card to try it?',
    answer:
      'No. Every plan is free today and no card is taken. The prices on this page are what each plan will cost when billing opens, and we will ask before that happens.',
  },
  {
    question: 'What happens to student information?',
    answer: (
      <>
        It stays inside your school. Every record is scoped to your organisation, and
        one school cannot read another. Consent records are append only, so an account
        cannot quietly edit the history of what it agreed to. The{' '}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          privacy policy
        </Link>{' '}
        sets this out in full.
      </>
    ),
  },
  {
    question: 'Are the students on this page real?',
    answer:
      'No, and none of them can be. They are six invented names used to show what the workspace looks like. Nothing on this page is connected to a live class, and nothing you do here reaches a record.',
  },
] as const;

export function Faq() {
  return (
    <section className="section page-width faq-section" id="faq" aria-labelledby="faq-heading">
      <div className="section-heading mb-8">
        <p className="section-tag">A few things you might be wondering</p>
        <h2 className="section-title">
          <span id="faq-heading">Good questions. Clear answers.</span>
        </h2>
      </div>

      <Accordion type="single" collapsible>
        {QUESTIONS.map((item) => (
          <AccordionItem key={item.question} value={item.question}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}