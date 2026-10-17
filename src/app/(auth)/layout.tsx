import Link from 'next/link';

import { LikoLogo } from '@/components/brand/LikoLogo';

/**
 * Auth shell. Split panel on desktop, centred single column on mobile.
 *
 * The left panel carries a real LIKO statement rather than stock photography,
 * which is why the file needs no image asset to look finished.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-14">
        {/*
          `-m-2 p-2` around the mark: the wordmark is 28px tall, which is right
          for a logo and small for a thumb. The column above already carries
          `py-8`, so the extra 16px is padding around the link rather than
          height, and the mark sits exactly where it did.
        */}
        <Link
          href="/"
          className="-m-2 flex w-fit shrink-0 items-center self-start rounded-[8px] p-2 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="LIKO home"
        >
          <LikoLogo showWordmark />
        </Link>

        <main id="main" className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
      </div>

      <aside className="relative hidden overflow-hidden bg-accent lg:block">
        {/*
          Both blooms are decorative and both sit on the accent fill, so they use
          `--on-accent` for the same reason the panel text below does: in dark
          mode the accent lifts to a light green, and anything painted white on
          it drops under the contrast floor.
        */}
        <div
          aria-hidden="true"
          className="bloom"
          style={{
            width: '30rem',
            height: '30rem',
            background: 'var(--on-accent)',
            top: '-6rem',
            right: '-8rem',
            opacity: 0.14,
          }}
        />
        <div
          aria-hidden="true"
          className="bloom"
          style={{
            width: '22rem',
            height: '22rem',
            /*
             * `--highlight`, the brand's one bright green, rather than the
             * hardcoded `#b7cfa8` sage this carried before the rebrand. That
             * value belonged to the old palette: it sat next to the old accent
             * as a tint of it, and against `oklch(0.48 0.13 151)` it reads as a
             * different brand rather than as a lighter one.
             */
            background: 'var(--highlight)',
            bottom: '-6rem',
            left: '-6rem',
            opacity: 0.22,
          }}
        />

        <div className="relative flex h-full flex-col justify-end p-14">
          <p className="text-label text-on-accent/70">Lessons, grades, quizzes, insights</p>
          <p className="mt-4 max-w-[18ch] text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] text-on-accent">
            Less admin. More teaching.
          </p>
          <p className="mt-5 max-w-[34ch] text-[1.0625rem] leading-relaxed text-on-accent/80">
            Your plans, assessments, gradebook, and student history stay attached to
            each other, so nothing gets rebuilt twice.
          </p>
        </div>
      </aside>
    </div>
  );
}