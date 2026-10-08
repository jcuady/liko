import { afterEach, describe, expect, it } from 'vitest';

import {
  CONSENT_COOKIE,
  forgetStoredTheme,
  optionalStorageAllowed,
  readConsent,
  writeConsent,
} from './browser';

/**
 * Node has no `document`, so these stub the one thing the module reads.
 *
 * A full jsdom environment would be heavier and would prove more than the thing
 * under test: the logic worth pinning here is the parsing of a cookie header,
 * which is a string operation, and the write is a string assignment. Both are
 * reproduced exactly.
 */
function withCookieHeader(header: string) {
  const stub = { cookie: header };
  Object.defineProperty(globalThis, 'document', {
    value: stub,
    configurable: true,
    writable: true,
  });
  return stub;
}

const originals = { document: globalThis.document, window: globalThis.window };

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    value: originals.document,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: originals.window,
    configurable: true,
    writable: true,
  });
});

describe('readConsent', () => {
  it('reads either stored choice', () => {
    withCookieHeader(`${CONSENT_COOKIE}=all`);
    expect(readConsent()).toBe('all');

    withCookieHeader(`${CONSENT_COOKIE}=essential`);
    expect(readConsent()).toBe('essential');
  });

  /*
   * A cookie jar is full of other people's cookies, and a stray `liko_consent_x=`
   * or a value of `essential; something` must not be mistaken for the answer.
   */
  it('does not match a cookie whose name merely starts the same', () => {
    withCookieHeader(`${CONSENT_COOKIE}_x=all`);
    expect(readConsent()).toBeNull();
  });

  it('finds the cookie among others, in any position', () => {
    withCookieHeader(`theme=dark; ${CONSENT_COOKIE}=essential; other=1`);
    expect(readConsent()).toBe('essential');
  });

  it('tolerates the whitespace a real header carries', () => {
    withCookieHeader(`  ${CONSENT_COOKIE} = all  `);
    expect(readConsent()).toBe('all');
  });

  it('rejects an unrecognised value rather than guessing', () => {
    for (const value of ['', 'yes', 'true', '1', 'ALL', 'none']) {
      withCookieHeader(`${CONSENT_COOKIE}=${value}`);
      expect(readConsent()).toBeNull();
    }
  });

  it('returns null when the jar is empty', () => {
    withCookieHeader('');
    expect(readConsent()).toBeNull();
  });
});

describe('optionalStorageAllowed', () => {
  /*
   * Absence counts as allowed. A visitor who never answers the banner has to get
   * a working site, so the product cannot sit behind the question.
   */
  it('treats an unanswered banner as permitted', () => {
    withCookieHeader('');
    expect(optionalStorageAllowed()).toBe(true);
  });

  it('is withdrawn only by an explicit decline', () => {
    withCookieHeader(`${CONSENT_COOKIE}=essential`);
    expect(optionalStorageAllowed()).toBe(false);

    withCookieHeader(`${CONSENT_COOKIE}=all`);
    expect(optionalStorageAllowed()).toBe(true);
  });
});

describe('writeConsent', () => {
  it('writes a readable, scoped cookie', () => {
    const stub = withCookieHeader('');
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { protocol: 'https:' },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        localStorage: { removeItem() {} },
      },
      configurable: true,
      writable: true,
    });

    writeConsent('essential');

    // `httpOnly` is deliberately absent: the banner reads this cookie on the
    // client, and that is the whole reason this one is readable. It carries no
    // identity, which is what makes that safe here and not for `liko_session`.
    expect(stub.cookie).toContain(`${CONSENT_COOKIE}=essential`);
    expect(stub.cookie).toContain('Path=/');
    expect(stub.cookie).toContain('SameSite=Lax');
    expect(stub.cookie).toContain('Secure');
    expect(stub.cookie).not.toContain('HttpOnly');
  });

  it('omits Secure on plain http so a local run can store it', () => {
    const stub = withCookieHeader('');
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { protocol: 'http:' },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        localStorage: { removeItem() {} },
      },
      configurable: true,
      writable: true,
    });

    writeConsent('all');
    expect(stub.cookie).not.toContain('Secure');
  });
});

describe('forgetStoredTheme', () => {
  it('removes the theme key and survives a storage failure', () => {
    const removed: string[] = [];
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          removeItem(key: string) {
            removed.push(key);
          },
        },
      },
      configurable: true,
      writable: true,
    });

    forgetStoredTheme();
    expect(removed).toEqual(['liko-theme']);

    // Private browsing and full quotas both make storage throw. The banner has
    // to still be able to record the choice, so the failure is swallowed.
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          removeItem() {
            throw new Error('QuotaExceededError');
          },
        },
      },
      configurable: true,
      writable: true,
    });

    expect(() => forgetStoredTheme()).not.toThrow();
  });
});