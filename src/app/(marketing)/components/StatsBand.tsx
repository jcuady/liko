import { Reveal } from './Reveal';

/**
 * Stats band. Four figures, sitting directly under the hero.
 *
 * These numbers are the strongest argument the page makes, and they used to
 * live in the seventh section, so they only reached the reader who scrolled
 * past two scroll narratives to find them. They now sit where the first screen
 * ends.
 *
 * The band is deliberately quiet. No heading, no eyebrow, no card chrome. It
 * reads as a coda to the headline rather than as a section of its own, and the
 * figures stay large enough to be seen without being the thing you look at.
 *
 * The caveat travels with the numbers. Two of the four are illustrative design
 * placeholders rather than measured outcomes, and an unsourced statistic about
 * teachers is exactly the claim the brand voice rules out.
 */

const STATS = [
  { value: '15h', label: 'average weekly admin load' },
  { value: '4', label: 'tools collapsed into one' },
  { value: '0', label: 'times the unit plan is retyped' },
  { value: '1', label: 'audit trail per mark' },
];

export function StatsBand() {
  return (
    <section aria-label="Key figures" className="border-t border-border py-12 md:py-14">
      <div className="container-marketing">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {STATS.map((stat, index) => (
            // `Reveal` becomes the `dl`'s grouping `div`, so the term stays
            // bound to its value. `dd` before `dt` is the name-value group form,
            // which is what a number over its caption is.
            <Reveal key={stat.label} delay={index * 0.06}>
              <dd className="tabular text-[2rem] font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[2.5rem]">
                {stat.value}
              </dd>
              <dt className="mt-3 max-w-[16ch] text-[0.9375rem] leading-snug text-ink-muted">
                {stat.label}
              </dt>
            </Reveal>
          ))}
        </dl>

        {/*
          Deliberately quiet, and deliberately never removed. The 15h and the 4
          are placeholders until published research lands, and a reader who
          sees the figures has to see that in the same glance.
        */}
        <p className="mt-10 max-w-[52ch] text-[0.8125rem] leading-relaxed text-ink-muted">
          The 15h and the 4 are illustrative design placeholders pending
          published research. They are not measured outcomes.
        </p>
      </div>
    </section>
  );
}