'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { useIsHydrated } from '@/lib/hooks/use-media-query';
import { useConsent } from '@/lib/consent/use-consent';

/**
 * Theme toggle.
 *
 * Renders a stable label until mounted, because the resolved theme is unknown
 * during SSR and a swapped icon would be a hydration mismatch.
 *
 * WHY IT CAN TURN THE THEME OFF. Picking a theme is the one thing in this app
 * that writes optional browser storage, so it is exactly what the cookie
 * banner's decline path withdraws. Pressing the toggle while storage is
 * withdrawn is worse than not offering it, because the value would look like it
 * had changed and would not survive a reload. So the control is disabled, it
 * says why, and the way back is one button away.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsHydrated();
  const choice = useConsent();

  const isDark = resolvedTheme === 'dark';
  // The server snapshot is `'answered'`, so this is false on the server and on
  // the first client render, and only becomes true for someone who genuinely
  // declined. No effect and no extra render needed.
  const blocked = choice === 'essential';

  if (blocked) {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled
        title="Choosing a theme stores that choice in this browser. Accept optional storage on the cookie banner to change it."
      >
        <MoonIcon size={16} weight="regular" aria-hidden="true" />
        Following system
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Switch theme'}
    >
      {mounted && isDark ? (
        <SunIcon size={16} weight="regular" aria-hidden="true" />
      ) : (
        <MoonIcon size={16} weight="regular" aria-hidden="true" />
      )}
      {mounted ? (isDark ? 'Light' : 'Dark') : 'Theme'}
    </Button>
  );
}