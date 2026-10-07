import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr';

import { LikoLogo } from '@/components/brand/LikoLogo';
import { Button } from '@/components/ui/button';
import { Reveal } from './Reveal';

/**
 * Final CTA. A full-bleed viridian panel, one button, one line of reassurance.
 *
 * The reassurance line sits here rather than under the hero, so the hero keeps
 * its four text elements and the closing panel carries the commercial ask
 * without stacking microcopy.
 *
 * The panel is the one place the page is allowed to be saturated, so it earns
 * the treatment: two soft blooms for depth and the wordmark ghosted far back
 * and bled off the right edge. Both are decoration and both are hidden from
 * assistive tech. The mark uses `currentColor`, so it inherits the white and
 * needs no separate asset.
 */
export function FinalCta() {
  return (
    <section className="chapter" aria-labelledby="final-cta-title">
      <div className="container-marketing">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-[24px] bg-accent px-6 py-14 md:px-14 md:py-20">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <span className="bloom -right-24 -top-24 size-[22rem] bg-[#7fdc93] opacity-45" />
              <span className="bloom -bottom-32 left-1/4 size-[20rem] bg-[#0f4d20] opacity-55" />
              {/*
                Sits behind the blooms, not above them, so it reads as printed
                into the panel rather than pasted on top of it.
              */}
              <LikoLogo
                showWordmark
                className="absolute -right-[6%] bottom-[-14%] h-auto w-[46rem] text-white/[0.07] select-none"
              />
            </div>

            <div className="relative max-w-[40rem]">
              <h2 id="final-cta-title" className="text-h2 text-white">
                Give the week back to teaching.
              </h2>
              <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-white/85">
                Your first class can be marked the same afternoon you sign up.
                Bring the roster you already have.
              </p>
              <div className="mt-8">
                <Button
                  asChild
                  size="lg"
                  className="group pressable gap-2 bg-white text-accent shadow-[var(--shadow-md)] hover:bg-white/90"
                >
                  <Link href="/register">
                    Start free trial
                    <ArrowRightIcon
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                      className="transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:translate-x-1"
                    />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}