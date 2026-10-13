// A server component can import a lucide icon from the package root: the icons
// carry no React context, so nothing has to be swapped out for the SSR build.
import { Check } from 'lucide-react';

import { Reveal } from '@/components/marketing/Reveal';
import { SectionHeading } from '@/components/marketing/SectionHeading';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRowHead,
  TableRow,
} from '@/components/ui/table';
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
        <Check size={16} aria-hidden="true" />
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
        <SectionHeading
          align="start"
          eyebrow="Every feature"
          title={<span id="compare-title">What each plan actually gives you.</span>}
          copy={
            <>No plan says &ldquo;everything in the plan above&rdquo;, because
            that is the one row you cannot decide from.</>
          }
        />

        <Reveal>
          {/*
            Negative margins let the table run to the screen edge while it
            scrolls, so the first column is never cut off by the page gutter.
          */}
          <div className="-mx-6 mt-12 overflow-x-auto md:mx-0">
            <Table className="min-w-[44rem]">
              {/*
                Built from PLANS rather than written out. This caption said
                "Starter" while the plan it named was called "Solo", and a
                hand-kept list of names is exactly how the page ended up selling
                two vocabularies in the first place. Both tiers are now called
                the same thing everywhere.
              */}
              <TableCaption className="sr-only">
                Feature comparison across the{' '}
                {PLANS.map((plan) => plan.name).join(', ')} plans
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-[34%] pb-6 pr-6">
                    <span className="text-label">Feature</span>
                  </TableHead>
                  {PLANS.map((plan) => (
                    <TableHead
                      key={plan.id}
                      scope="col"
                      className="pb-6 text-[0.9375rem] font-medium normal-case text-ink"
                    >
                      {plan.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              {COMPARISON.map((group) => (
                <TableBody key={group.title}>
                  {/*
                    `border-b-0` on the group heading and `last:border-b` on the
                    rows are deliberate and they are the only two border overrides
                    in the product. This table is several `<tbody>` elements in
                    one table, so the primitive's `last:border-b-0`, which is per
                    row group, would strip the rule off the end of every group
                    and run the sections together. The rule under a group's last
                    row is the section separator here.
                  */}
                  <TableRow className="border-b-0">
                    <TableHead
                      scope="colgroup"
                      colSpan={PLANS.length + 1}
                      className="border-b-0 pb-4 pt-10 text-left"
                    >
                      <span className="text-label">{group.title}</span>
                    </TableHead>
                  </TableRow>
                  {group.rows.map((row) => (
                    <TableRow key={row.label} className="last:border-b">
                      <TableRowHead
                        scope="row"
                        className="py-4 pr-6 align-top font-medium"
                      >
                        {row.label}
                      </TableRowHead>
                      {row.cells.map((cell, index) => (
                        <TableCell
                          key={`${row.label}-${PLANS[index].id}`}
                          className="py-4 align-top leading-snug"
                        >
                          <Value cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              ))}
            </Table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}