'use client';

import * as React from 'react';

import {
  readConsentOnServer,
  readConsentSnapshot,
  subscribeToConsent,
  type ConsentState,
} from './browser';

/**
 * Subscribes a component to the cookie consent choice.
 *
 * WHY `useSyncExternalStore` AND NOT AN EFFECT.
 *
 * The first version read the cookie in an effect and pushed it into state. That
 * is a render-phase read of mutable external state followed by a second render,
 * which is the pattern React's `set-state-in-effect` lint rule exists to catch:
 * it costs an extra pass on every component that asks, and it is subtly wrong
 * for a value that can change between two components on the same page, because
 * each one would have its own copy of the answer.
 *
 * The cookie really is an external store. It changes when someone presses a
 * button, `writeConsent` announces it on a custom event, and this hook re-reads
 * it from a single place. The server snapshot is `'answered'`, so the very first
 * render on both sides agrees that there is nothing conditional to draw, and the
 * real value arrives on hydration without a mismatch.
 */
export function useConsent(): ConsentState {
  return React.useSyncExternalStore(
    subscribeToConsent,
    readConsentSnapshot,
    readConsentOnServer,
  );
}