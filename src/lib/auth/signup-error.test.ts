import { describe, expect, it } from 'vitest';

import { classifySignupFailure, signupFailureMessage } from './signup-error';

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

/**
 * The wording, and the one thing about it that is easy to get wrong.
 *
 * The classification was testable and the wording was not: the two lived in
 * different files and nothing pinned them together, so the action could map a
 * spent quota to the generic sentence and the suite would still be green. The
 * sentence is what a teacher reads while the project cannot send them a
 * confirmation link, so it has to be right in both directions.
 */
describe('signupFailureMessage', () => {
  it('names the email when the quota is spent, because the advice is different', () => {
    const message = signupFailureMessage('SIGNUP_RATE_LIMITED');

    expect(message).toContain('confirmation email');
    // The wrong advice is the failure this exists to prevent.
    expect(message).not.toContain('Check the details');
  });

  it('says the generic thing when the account was not created', () => {
    const message = signupFailureMessage('ACCOUNT_NOT_CREATED');

    expect(message).toContain('Check the details');
    // The rate-limit sentence must not leak into the opaque answer, because
    // the opaque answer is the one that is safe for every address.
    expect(message).not.toContain('confirmation email');
  });

  it('gives the two failures different sentences', () => {
    expect(signupFailureMessage('SIGNUP_RATE_LIMITED')).not.toBe(
      signupFailureMessage('ACCOUNT_NOT_CREATED'),
    );
  });
});