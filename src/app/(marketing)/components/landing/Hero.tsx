import Link from 'next/link';
import { ArrowUpRight, Check, ScanLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WorkspaceMock } from './WorkspaceMock';

/**
 * The hero. A near-black green panel with the mock leaning out of it.
 *
 * The design sets this section against the forest panel, which is the one place
 * in the product where `text-on-accent` is the wrong token and `text-forest` is
 * the right one: the highlight green is too light to carry white text, and the
 * two hero button variants exist for exactly this pairing.
 *
 * The panel is inset rather than full bleed, which is the design's own choice and
 * is what lets the mock appear to overhang the bottom edge.
 */

function FloatingLabel({
  className,
  icon,
  title,
  detail,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        'absolute z-10 hidden items-center gap-2.5 rounded-[8px] bg-surface-raised px-4 py-3 text-ink shadow-lg lg:flex',
        className,
      )}
    >
      {icon}
      <div>
        <strong className="block text-[16px] leading-tight">{title}</strong>
        <small className="text-[10px] text-ink-muted">{detail}</small>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-2.5 mt-2.5 overflow-hidden rounded-[14px] md:mx-6 md:rounded-[20px]">
      <div className="forest-panel forest-grid min-h-[690px] md:min-h-[720px]">
        <div className="relative z-10 mx-auto max-w-[850px] px-5 pt-11 md:pt-12">
          <p className="inline-flex items-center gap-2 rounded-full border border-hero-border px-3 py-[7px] text-[10px] font-semibold uppercase tracking-[0.11em]">
            <span className="size-[5px] rounded-full bg-highlight" aria-hidden="true" />
            Your new favorite teaching assistant
          </p>

          <h1 className="my-5 text-[clamp(2.375rem,6vw,3.5rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-balance">
            Liko. Less admin.
            <br />
            <span className="text-highlight">More teaching.</span> More impact.
          </h1>

          <p className="mx-auto max-w-[570px] text-[13px] leading-[1.7] opacity-75 md:text-[15px]">
            Meet Liko. Your lessons, grades, quizzes, and student insights, finally
            together. So you can focus on the students, not the spreadsheets.
          </p>

          <div className="my-3.5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="hero" size="cta">
              <Link href="/register">
                Start teaching with Liko
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="hero-outline" size="cta">
              <Link href="/register">
                <Check aria-hidden="true" />
                See what you get
              </Link>
            </Button>
          </div>

          <p className="text-[11px] opacity-60">Free to get started. No card is taken.</p>
        </div>

        <div className="product-tilt relative z-10 mx-auto -mb-[120px] mt-9 w-[calc(100%-30px)] max-w-[900px] overflow-hidden rounded-[12px] border-[7px] border-white/15 shadow-lg md:w-[85%]">
          <WorkspaceMock className="h-[340px] md:h-[420px]" />

          <FloatingLabel
            className="-left-14 top-[110px] -rotate-[5deg]"
            icon={
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-accent-subtle text-accent"
              >
                <Check size={16} />
              </span>
            }
            title="A little less busywork."
            detail="A lot more room to teach."
          />

          <FloatingLabel
            className="-right-16 top-[215px] rotate-[4deg]"
            icon={<ScanLine size={25} className="text-accent" aria-hidden="true" />}
            title="Paper quiz. Instant insights."
            detail="Scan it, score it, act on it."
          />
        </div>
      </div>
    </section>
  );
}