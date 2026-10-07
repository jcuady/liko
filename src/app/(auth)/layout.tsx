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
        <Link href="/" className="shrink-0 self-start" aria-label="LIKO home">
          <LikoLogo showWordmark />
        </Link>

        <main id="main" className="flex flex-1 items-center py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
      </div>

      <aside className="relative hidden overflow-hidden bg-accent lg:block">
        <div
          aria-hidden="true"
          className="bloom"
          style={{
            width: '30rem',
            height: '30rem',
            background: '#ffffff',
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
            background: '#b7cfa8',
            bottom: '-6rem',
            left: '-6rem',
            opacity: 0.22,
          }}
        />

        <div className="relative flex h-full flex-col justify-end p-14">
          <p className="text-label text-white/70">Plan, create, assess, grade, analyze</p>
          <p className="mt-4 max-w-[18ch] text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
            One thread through the whole term.
          </p>
          <p className="mt-5 max-w-[34ch] text-[1.0625rem] leading-relaxed text-white/80">
            Your plans, assessments, gradebook, and student history stay attached
            to each other, so nothing gets rebuilt twice.
          </p>
        </div>
      </aside>
    </div>
  );
}