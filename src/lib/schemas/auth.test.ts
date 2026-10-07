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
  it('accepts a valid registration', () => {
    const result = registerSchema.safeParse({
      name: 'Maya Okonkwo',
      email: 'maya@school.edu',
      password: 'Good-Pass-1',
    });
    expect(result.success).toBe(true);
  });

  it('enforces the password rules the UI checklist shows', () => {
    const base = { name: 'Maya Okonkwo', email: 'maya@school.edu' };

    expect(registerSchema.safeParse({ ...base, password: 'short1A' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'alllowercase1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'ALLUPPERCASE1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'NoDigitsHere' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'Good-Pass-1' }).success).toBe(true);
  });

  it('rejects a too-short or too-long name', () => {
    const base = { email: 'maya@school.edu', password: 'Good-Pass-1' };
    expect(registerSchema.safeParse({ ...base, name: 'M' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, name: 'x'.repeat(200) }).success).toBe(false);
  });

  it('reports one message per field so the summary can list them', () => {
    const result = registerSchema.safeParse({ name: 'M', email: 'bad', password: 'weak' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields).toEqual(new Set(['name', 'email', 'password']));
    }
  });
});