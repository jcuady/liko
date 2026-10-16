import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema } from './auth';

describe('loginSchema', () => {
  it('accepts a well-formed pair', () => {
    const result = loginSchema.safeParse({
      email: '  Teacher@School.EDU ',
      password: 'anything',
    });
    expect(result.success).toBe(true);
    // Email is normalised so lookups are case-insensitive.
    expect(result.success && result.data.email).toBe('teacher@school.edu');
  });

  it('rejects an empty or malformed email', () => {
    for (const email of ['', 'nope', 'a@b', 'a b@c.com']) {
      expect(loginSchema.safeParse({ email, password: 'x' }).success).toBe(false);
    }
  });

  it('requires a password but does not apply strength rules at login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'Maya Okonkwo',
    email: 'maya@school.edu',
    password: 'Good-Pass-1',
    acceptedTerms: 'on',
    acceptedPrivacy: 'on',
  };

  it('accepts a valid registration that accepts the terms', () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('requires the terms to be accepted', () => {
    const result = registerSchema.safeParse({ ...valid, acceptedTerms: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'acceptedTerms');
      expect(issue?.message).toBe('Accept the terms to create an account.');
    }
  });

  it('requires the privacy notice to be accepted', () => {
    const result = registerSchema.safeParse({ ...valid, acceptedPrivacy: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'acceptedPrivacy');
      expect(issue?.message).toBe('Accept the privacy notice to create an account.');
    }
  });

  /*
   * A hidden checkbox posts nothing at all, an unchecked one posts nothing, and
   * a tampered request posts anything. All three must land on the same refusal,
   * so the field is a literal string rather than a boolean.
   */
  it('treats anything other than the posted marker as not accepted', () => {
    for (const value of ['', 'off', 'false', '0', 'no', null, undefined]) {
      expect(registerSchema.safeParse({ ...valid, acceptedTerms: value }).success).toBe(false);
    }
  });

  /*
 * WHICH ROLES A PUBLIC FORM MAY ASK FOR.
 *
 * This used to assert that no role could be satisfied at all, because the schema
 * had no `role` field and Zod stripped one. Students can now create their own
 * accounts, so the property under test changed shape but did not weaken.
 *
 * The security property was never "the role is dropped", which was a silent
 * outcome. It was "a post cannot make itself an administrator or a guardian",
 * and it is now enforced by an admission list that REJECTS those values outright
 * rather than parsing them and throwing the field away. The difference matters:
 * a rejected role means no account is created, and the caller is told, whereas a
 * stripped role means the account is created anyway and the caller believes the
 * post was honoured.
 */
it('admits a student who is creating their own account', () => {
  const asStudent = registerSchema.safeParse({ ...valid, role: 'student' });
  expect(asStudent.success).toBe(true);
  expect(asStudent.success && asStudent.data.role).toBe('student');
});

it('still refuses a post that asks to be an administrator or a guardian', () => {
  // These must fail the parse, not be stripped. A stripped role would still
  // create an account, which is not the same as refusing the request.
  for (const role of ['admin', 'guardian', 'Admin', 'ADMIN', 'owner', '', 1, null]) {
    expect(registerSchema.safeParse({ ...valid, role }).success).toBe(false);
  }
});

it('defaults to a teacher account when no role was posted at all', () => {
  // The pricing-link path an existing teacher takes. It must not break.
  const omitted = registerSchema.safeParse({ ...valid });
  expect(omitted.success).toBe(true);
  expect(omitted.success && omitted.data.role).toBe('instructor');
});

  it('enforces the password rules the UI checklist shows', () => {
    const base = { name: 'Maya Okonkwo', email: 'maya@school.edu' };

    expect(registerSchema.safeParse({ ...base, ...valid }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: 'short1A' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'alllowercase1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'ALLUPPERCASE1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'NoDigitsHere' }).success).toBe(false);
  });

  it('rejects a too-short or too-long name', () => {
    const base = { email: 'maya@school.edu', password: 'Good-Pass-1' };
    expect(registerSchema.safeParse({ ...base, name: 'M' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, name: 'x'.repeat(200) }).success).toBe(false);
  });

  it('reports one message per field so the summary can list them', () => {
    const result = registerSchema.safeParse({
      name: 'M',
      email: 'bad',
      password: 'weak',
      acceptedTerms: undefined,
      acceptedPrivacy: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields).toEqual(
        new Set(['name', 'email', 'password', 'acceptedTerms', 'acceptedPrivacy']),
      );
    }
  });
});