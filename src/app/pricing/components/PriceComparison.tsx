// The table is a server component, so the icon comes from the SSR entry point.
// The default entry uses context and hooks, which a server component cannot run.
import { CheckIcon } from '@phosphor-icons/react/dist/ssr';

import { Reveal } from '@/app/(marketing)/components/Reveal';
import { SectionHeader } from '@/app/(marketing)/components/SectionHeader';
import { COMPARISON, PLANS, type Cell } from '../plans';

/**
 * Feature comparison.
 *
 * Every cell says what the plan does. A row reading "everything in the plan
 * above" would hide exactly the thing a reader comparing plans came for, so
 * the wording is spelled out per plan and "Not included" is written out rather
 * than implied by an empty cell or a colour.
 *
 * A real `<table>` with a real caption and scoped headers, inside a sideways
 * scroller below `md`. The scroller is what keeps four columns off a 320px
 * viewport without a second, stacked copy of the same content for a screen
 * reader to read twice.
 */

function Value({ cell }: { cell: Cell }) {
  if (cell === true) {
    return (
      <span className="inline-flex items-center gap-2 text-accent">
        <CheckIcon size={16} weight="bold" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </span>
    );
  }

  return <span className="text-ink-muted">{cell}</span>;
}

export function PriceComparison() {
  return (
    <section
      id="compare"
      aria-labelledby="compare-title"
      className="chapter border-t border-border"
    >
      <div className="container-marketing">
        <SectionHeader
          label="Every feature"
          id="compare-title"
          title="What each plan actually gives you."
        >
          <p className="measure text-lead">
            No plan says &ldquo;everything in the plan above&rdquo;, because that
            is the one row you cannot decide from.
          </p>
        </SectionHeader>

        <Reveal>
          {/*
            Negative margins let the table run to the screen edge while it
            scrolls, so the first column is never cut off by the page gutter.
          */}
          <div className="-mx-6 mt-12 overflow-x-auto md:mx-0">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              {/*
                Built from PLANS rather than written out. This caption said
                "Starter" while the plan it names is called "Solo", and a
                hand-kept list of names is exactly how the page ended up selling
                two vocabularies in the first place.
              */}
              <caption className="sr-only">
                Feature comparison across the{' '}
                {PLANS.map((plan) => plan.name).join(', ')} plans
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-[34%] border-b border-border pb-4 pr-6 align-bottom"
                  >
                    <span className="text-label">Feature</span>
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.id}
                      scope="col"
                      className="border-b border-border px-4 pb-4 align-bottom text-[0.9375rem] font-medium text-ink"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>

              {COMPARISON.map((group) => (
                <tbody key={group.title}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={PLANS.length + 1}
                      className="pb-4 pt-10 text-left"
                    >
                      <span className="text-label">{group.title}</span>
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-b border-border">
                      <th
                        scope="row"
                        className="py-4 pr-6 align-top text-[0.9375rem] font-medium text-ink"
                      >
                        {row.label}
                      </th>
                      {row.cells.map((cell, index) => (
                        <td
                          key={`${row.label}-${PLANS[index].id}`}
                          className="px-4 py-4 align-top text-[0.9375rem] leading-snug"
                        >
                          <Value cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}