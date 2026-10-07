'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { useIsHydrated } from '@/lib/hooks/use-media-query';

/**
 * Theme toggle.
 *
 * Renders a stable label until mounted, because the resolved theme is unknown
 * during SSR and a swapped icon would be a hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsHydrated();

  const isDark = resolvedTheme === 'dark';

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