/**
 * Browser-side cookie consent.
 *
 * Readable by JavaScript on purpose. The banner has to read the answer before it
 * renders, and it renders on the client, so an `httpOnly` cookie would be
 * invisible to the very code that needs it. That is the correct trade for this
 * one value: it carries no identity and no session, so being readable costs
 * nothing. The session cookie, which does, stays `httpOnly`.
 *
 * The consent RECORD for an account is a different thing entirely and does not
 * live here. That is written server-side by `recordConsent`, into a table the
 * account holder cannot read or edit. This cookie only stops the banner asking
 * again.
 */

export const CONSENT_COOKIE = 'liko_consent';

/** Kept in step with `storageKey` on the theme provider. */
export const THEME_STORAGE_KEY = 'liko-theme';

/** 180 days. Long enough not to nag, short enough that a change can catch up. */
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type ConsentChoice = 'all' | 'essential';

/**
 * What the UI knows about the choice.
 *
 * `'unknown'` means nobody has answered yet. `'answered'` is the server's
 * snapshot and means only "do not render anything that depends on this", because
 * the server has no way to read the cookie. It is deliberately not `'all'`: a
 * server snapshot of `'all'` would be a claim the server cannot support.
 */
export type ConsentState = ConsentChoice | 'unknown' | 'answered';

export function readConsent(): ConsentChoice | null {
  if (typeof document === 'undefined') return null;

  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.split('=');
    if (name?.trim() !== CONSENT_COOKIE) continue;

    const value = decodeURIComponent(rest.join('=').trim());
    return value === 'all' || value === 'essential' ? value : null;
  }

  return null;
}

/**
 * Fired on `window` when the choice changes, so `useSyncExternalStore` can tell
 * the banner and the theme toggle to re-read. A cookie is not observable without
 * this: nothing fires when `document.cookie` is assigned.
 */
export const CONSENT_EVENT = 'liko:consent';

export function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * Client snapshot. A primitive, which is what `useSyncExternalStore` needs: it
 * compares with `Object.is`, so returning a fresh object here would loop.
 */
export function readConsentSnapshot(): ConsentState {
  return readConsent() ?? 'unknown';
}

/** Server snapshot. The server cannot see a cookie, so it renders nothing. */
export function readConsentOnServer(): ConsentState {
  return 'answered';
}

export function writeConsent(choice: ConsentChoice): void {
  if (typeof document === 'undefined') return;

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;

  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/**
 * True when optional browser storage is allowed.
 *
 * Absence counts as allowed until someone declines. That ordering matters: a
 * person who never answers must still get a working site, so the product has to
 * behave normally before the question is asked. It also means the banner is a
 * real gate rather than a formality, because declining genuinely changes what is
 * stored.
 */
export function optionalStorageAllowed(): boolean {
  return readConsent() !== 'essential';
}

/**
 * Removes a stored theme preference.
 *
 * Called when someone switches to Essential only, so that a preference written
 * before they declined does not outlive the decline. It is also what makes the
 * promise in `/cookies` true: after choosing Essential only, nothing about the
 * theme is kept, not even something kept earlier.
 */
export function forgetStoredTheme(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can throw when it is disabled or full. There is nothing useful to
    // do about it here, and the banner must still be able to record the choice.
  }
}