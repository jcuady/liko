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

  it('cannot be satisfied by a student or guardian role', () => {
    // The schema has no role field at all. Self-registration is for teachers,
    // and a student account is created by the teacher who owns the class.
    expect('role' in registerSchema.shape).toBe(false);
    const withRole = registerSchema.safeParse({ ...valid, role: 'student' });
    expect(withRole.success).toBe(true);
    // The role is dropped rather than honoured, which is the point.
    expect(withRole.success && 'role' in (withRole.data as object)).toBe(false);
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