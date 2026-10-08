import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr';

import { Button } from '@/components/ui/button';
import { HeroEmailForm } from './HeroEmailForm';
import { ProductPreview } from './ProductPreview';
import {
  attendance,
  stats,
  students,
} from '@/lib/fixtures/workspace';
import type { AttendanceStatus, Student } from '@/lib/api/types';

/**
 * Hero. Editorial split, never centred.
 *
 * Five text elements and no more: one eyebrow, one headline, one subhead, one
 * CTA row, one reassurance line. The line was deliberately parked in the FAQ
 * to keep the stack to four, on the theory that a hero full of microcopy is how
 * a landing page stops reading as a headline. That theory was wrong about what
 * the line was doing. "No credit card required" is not decoration competing
 * with the headline, it is the answer to the question the email field has
 * already asked: what happens if I press this. Answering it here costs one line
 * and removes the hesitation before it forms, where the FAQ answers it only
 * after a reader has already scrolled past two scroll narratives to ask.
 *
 * The restraint that still holds: one line, one sentence, no feature claims,
 * and it sits under the CTA it qualifies rather than beside the headline.
 *
 * The bottom padding is tighter than it was, because the stats band now follows
 * the hero directly and is meant to land on the first screen. The hero gives up
 * the space it no longer needs on its own account.
 *
 * A server component. The headline, the subhead, and the product mockup are
 * static, so rendering them here keeps them out of the client bundle; the only
 * part of the hero that needed a runtime, the email capture, lives in
 * `HeroEmailForm`.
 */

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-12 md:pb-20 md:pt-16 lg:pb-24 lg:pt-20">
      <div className="container-marketing">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6 xl:col-span-5">
            <p className="text-label">Plan to grade, one path</p>

            <h1 className="text-display mt-5 max-w-[13ch]">
              Every teaching task, in{' '}
              <em className="italic-accent text-accent">one flow</em>.
            </h1>

            <p className="measure mt-6 text-lead">
              LIKO holds your plans, assessments, gradebook, and student history
              on a single thread, so nothing gets rebuilt twice.
            </p>

            <HeroEmailForm />

            <div className="mt-6">
              <Button asChild variant="link" size="sm" className="group gap-1.5">
                <a href="#flow">
                  See the flow
                  <ArrowRightIcon
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:translate-x-1"
                  />
                </a>
              </Button>
            </div>
          </div>

          {/*
            The preview is a real miniature of the workspace, not a built
            screenshot. It is hidden below lg because on small screens the copy
            should carry the whole viewport. `min-w-0` lets the column shrink
            below the dashboard table's intrinsic width instead of overflowing.
          */}
          <div className="hidden min-w-0 lg:col-span-6 lg:block xl:col-span-7">
            <ProductPreview
              stats={stats as Parameters<typeof ProductPreview>[0]['stats']}
              students={students as Student[]}
              attendance={attendance as Record<string, AttendanceStatus>}
            />
          </div>
        </div>
      </div>
    </section>
  );
}