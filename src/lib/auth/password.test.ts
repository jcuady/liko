import { describe, expect, it } from 'vitest';

import {
  checkPasswordStrength,
  hashPassword,
  verifyPassword,
} from './password';

describe('hashPassword and verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    await expect(verifyPassword('Correct-Horse-9', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-9');
    await expect(verifyPassword('Correct-Horse-99', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time for the same input', async () => {
    const a = await hashPassword('Same-Password-1');
    const b = await hashPassword('Same-Password-1');
    expect(a).not.toBe(b);
    await expect(verifyPassword('Same-Password-1', a)).resolves.toBe(true);
    await expect(verifyPassword('Same-Password-1', b)).resolves.toBe(true);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('Plaintext-Visible-1');
    expect(hash).not.toContain('Plaintext-Visible-1');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('refuses a malformed stored hash instead of throwing', async () => {
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'scrypt$a$b$c$zz$yy']) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false);
    }
  });
});

describe('checkPasswordStrength', () => {
  it('accepts a strong password', () => {
    expect(checkPasswordStrength('Good-Pass-1').ok).toBe(true);
  });

  it('names each missing rule', () => {
    expect(checkPasswordStrength('short').problems).toEqual(
      expect.arrayContaining(['Use at least 10 characters.', 'Add an uppercase letter.', 'Add a number.']),
    );
    expect(checkPasswordStrength('aaaaaaaaaaaaaa').problems).toContain(
      'Add an uppercase letter.',
    );
    expect(checkPasswordStrength('AAAAAAAAAAAAAA').problems).toEqual(
      expect.arrayContaining([
        'Add a lowercase letter.',
        'Add a number.',
      ]),
    );
    expect(checkPasswordStrength('Good-Password').problems).toContain('Add a number.');
  });

  it('does not report a rule the password already satisfies', () => {
    // "Aaaaaaaaaaaaaa" contains lowercase a's, so a lowercase rule must not
    // be raised against it.
    expect(checkPasswordStrength('Aaaaaaaaaaaaaa').problems).not.toContain(
      'Add a lowercase letter.',
    );
  });

  it('rejects a single repeated character', () => {
    expect(checkPasswordStrength('aaaaaaaaaaaaaa').problems).toContain(
      'Avoid a single repeated character.',
    );
  });
});