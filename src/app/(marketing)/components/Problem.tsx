import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr';

import { SectionHeader } from './SectionHeader';
import { Reveal } from './Reveal';

/**
 * Problem. Rule of three, stated as consequences rather than complaints.
 *
 * Not cards: three hairline-separated rows with a ghosted numeral in the margin.
 * Each row names the cost and links forward to the Flow stage that removes it,
 * so the section earns its place instead of restating the hero.
 */

const ROWS = [
  {
    headline: 'Plan in one app, then re-type it into three others.',
    body: 'The unit lives in a document, the timings live in a spreadsheet, and the objectives live in the LMS. They disagree by week three.',
    href: '#flow',
    hrefLabel: 'See the Plan stage',
  },
  {
    headline: 'Grade in a spreadsheet, then lose the audit trail.',
    body: 'You get a mark, not the reason behind it. When a student or a parent asks how that number was reached, the evidence is gone.',
    href: '#flow',
    hrefLabel: 'See the Grade stage',
  },
  {
    headline: 'Track students on paper, then find the drop-off late.',
    body: 'By the time the pattern is obvious it is the end of term. The intervention that would have worked is six weeks behind you.',
    href: '#flow',
    hrefLabel: 'See the Analyze stage',
  },
];

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="chapter">
      <div className="container-marketing">
        <SectionHeader
          label="The problem"
          id="problem-title"
          title={
            <>
              Most teaching software sells you a
              <em className="italic-accent text-ink"> better tool</em>, not
              fewer handoffs.
            </>
          }
        >
          <p className="measure text-lead">
            Three things break a teacher&apos;s week. None of them are solved by
            a single better app.
          </p>
        </SectionHeader>

        <ul className="mt-14 border-t border-border md:mt-20">
          {ROWS.map((row, index) => (
            <li key={row.headline} className="border-b border-border">
              {/*
                The reveal sits inside the `li`, not around it. `Reveal` renders
                a div, and a div between `ul` and `li` is invalid, so the row
                article carries the grid while the wrapper only handles motion.
              */}
              <Reveal delay={index * 0.07}>
                <article className="group grid gap-4 py-8 md:grid-cols-12 md:gap-8 md:py-10">
                  <div className="md:col-span-8">
                    <h3 className="text-h4 max-w-[28ch]">{row.headline}</h3>
                    <p className="measure mt-3 text-body">{row.body}</p>
                  </div>
                  <div className="md:col-span-4 md:self-center md:justify-self-end">
                    <a
                      href={row.href}
                      className="pressable inline-flex items-center gap-1.5 rounded-[8px] text-[0.9375rem] font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                    >
                      {row.hrefLabel}
                      <ArrowRightIcon
                        size={14}
                        weight="bold"
                        aria-hidden="true"
                        className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:translate-x-1"
                      />
                    </a>
                  </div>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}