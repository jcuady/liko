import { describe, expect, it } from 'vitest';

import { classifySignupFailure } from './signup-error';

/**
 * A signup can fail three ways and only one of them is the caller's fault.
 *
 * These pin the split, because the two answers protect different things and a
 * regression in either is silent. Collapsing everything into the opaque answer
 * is not a safety improvement, it is the bug: a spent email quota was reported
 * as "check the details and try again", which tells someone to correct a form
 * that was already right.
 *
 * The enumeration half is the reason the split is narrow rather than generous.
 */

describe('classifySignupFailure', () => {
  it('names a spent email quota, which is what this project actually returned', () => {
    // The real response from ulrjitekiylgepdyijsw, verbatim.
    expect(
      classifySignupFailure({
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      }),
    ).toBe('SIGNUP_RATE_LIMITED');
  });

  it('treats any 429 as transient even when the code is unfamiliar', () => {
    // A new provider-side code must not silently demote to the generic answer
    // and start blaming the caller's spelling again.
    expect(classifySignupFailure({ status: 429, code: 'something_new' })).toBe(
      'SIGNUP_RATE_LIMITED',
    );
  });

  it('catches a rate limit that arrives without a 429 status', () => {
    expect(classifySignupFailure({ code: 'over_request_rate_limit' })).toBe(
      'SIGNUP_RATE_LIMITED',
    );
    expect(classifySignupFailure({ message: 'Too many requests' })).toBe('SIGNUP_RATE_LIMITED');
  });

  it('keeps "already registered" indistinguishable from every other failure', () => {
    // This is the case that must stay opaque. Naming it would turn the register
    // form into a way to test whether an address has an account.
    expect(
      classifySignupFailure({
        status: 422,
        code: 'user_already_exists',
        message: 'User already registered',
      }),
    ).toBe('ACCOUNT_NOT_CREATED');
  });

  it('stays opaque for a weak password or any other permanent rejection', () => {
    expect(
      classifySignupFailure({
        status: 422,
        code: 'weak_password',
        message: 'Password should be at least 6 characters',
      }),
    ).toBe('ACCOUNT_NOT_CREATED');
  });

  it('treats a missing error as the generic failure rather than throwing', () => {
    expect(classifySignupFailure(null)).toBe('ACCOUNT_NOT_CREATED');
    expect(classifySignupFailure(undefined)).toBe('ACCOUNT_NOT_CREATED');
    expect(classifySignupFailure({})).toBe('ACCOUNT_NOT_CREATED');
  });
});