'use client';

import * as React from 'react';

/**
 * Media query subscription.
 *
 * Uses `useSyncExternalStore` rather than the usual
 * `useState` + `useEffect` + `setMatches` in the effect body. That pattern
 * causes a cascading render on every mount; this one reads the current value
 * during render and subscribes to changes without an intermediate render.
 *
 * The server snapshot is `false` because a query cannot be evaluated there, and
 * `useIsDesktop` therefore renders the mobile branch during SSR, then switches
 * to the desktop branch on hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True on pointer devices where hover is meaningful. */
export function useHasHover(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}

/** The landing-page scroll narratives only run at or above this width. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * True once the component has hydrated on the client.
 *
 * The idiomatic `useState` + `useEffect` version calls `setState` inside the
 * effect body, which triggers a cascading render. This version stores a
 * constant instead, so nothing is scheduled.
 *
 * Use it only where a value differs between server and client, such as the
 * resolved theme. Never use it to gate ordinary rendering.
 */
export function useIsHydrated(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}