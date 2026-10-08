'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CookieIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { isProtectedPath } from '@/lib/auth/rbac';
import {
  forgetStoredTheme,
  writeConsent,
  type ConsentChoice,
} from '@/lib/consent/browser';
import { useConsent } from '@/lib/consent/use-consent';

import { recordCookieConsent } from './actions';

/**
 * Cookie consent banner.
 *
 * WHY THIS IS NOT A TRACKER OPT-OUT. There is nothing here to opt out of. LIKO
 * runs no analytics, no advertising and no third party tags, which is stated
 * plainly on `/cookies` and repeated in the last line of the banner so nobody
 * has to go looking for it.
 *
 * So the only genuinely optional thing is the theme preference, and that is what
 * the two buttons decide. Declining does not break the product: the site follows
 * the operating system's light or dark setting instead of your last choice, and
 * every other part behaves identically. A consent banner whose decline button
 * quietly degrades the product is a dark pattern, which is the whole reason the
 * decline path here is small and says exactly what it costs.
 *
 * Absence counts as acceptance until someone declines, so the site is fully
 * functional for a visitor who never answers.
 *
 * IT DOES NOT APPEAR IN THE WORKSPACE. Once someone is working, a marketing
 * surface sliding in over a gradebook is in the way rather than helpful, and the
 * setting is reachable from the appearance settings page instead.
 */
export function CookieConsentBanner() {
  const pathname = usePathname();
  const [, startTransition] = React.useTransition();

  /*
   * A single subscription rather than a cookie read copied into state. The
   * server snapshot is `'answered'`, so this renders nothing on the server and
   * nothing on the first client render either, then the real value arrives on
   * hydration. That is one render wasted at worst, against a form that would
   * otherwise flash for anyone who had already answered.
   */
  const choice = useConsent();

  const inWorkspace = pathname !== null && isProtectedPath(pathname);

  function decide(next: ConsentChoice) {
    writeConsent(next);
    if (next === 'essential') forgetStoredTheme();

    // Fire and forget. A failed record must not undo the choice the person just
    // made in their own browser, so nothing here is allowed to block on it.
    startTransition(() => {
      void recordCookieConsent();
    });
  }

  if (inWorkspace || choice !== 'unknown') return null;

  return (
    <div
      role="region"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[14px] border border-border bg-surface-raised p-5 shadow-[var(--shadow-lg)] md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
            <CookieIcon size={17} aria-hidden="true" className="shrink-0 text-accent" />
            One question about your browser
          </p>
          <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">
            We store your light or dark choice on this device so the next page is
            not a flash of white. Keep it, or follow your system setting
            instead. Either way you stay signed in.
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-subtle">
            No analytics, no advertising, no third party trackers.{' '}
            <Link
              href="/cookies"
              className="rounded-[4px] font-medium text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              What we store
            </Link>
          </p>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row md:flex-col">
          <Button variant="secondary" onClick={() => decide('essential')}>
            Follow my system
          </Button>
          <Button onClick={() => decide('all')}>Keep my choice</Button>
        </div>
      </div>
    </div>
  );
}