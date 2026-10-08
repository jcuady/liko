import { describe, expect, it } from 'vitest';

import { safeNextPath } from './redirect';

const fallback = '/overview';

describe('safeNextPath', () => {
  it('keeps an ordinary same-origin path', () => {
    expect(safeNextPath('/grades', { fallback })).toBe('/grades');
    expect(safeNextPath('/settings/profile', { fallback })).toBe('/settings/profile');
  });

  it('preserves the query string', () => {
    expect(safeNextPath('/slides?deck=abc', { fallback })).toBe('/slides?deck=abc');
  });

  it('drops the fragment unless asked to keep it', () => {
    expect(safeNextPath('/plan#week-3', { fallback })).toBe('/plan');
    expect(safeNextPath('/plan#week-3', { fallback, keepHash: true })).toBe('/plan#week-3');
  });

  /*
   * The backslash form is the reason this module exists. The WHATWG URL parser
   * treats a backslash as a forward slash for special schemes, so `/\evil.com`
   * is `//evil.com` and lands on the host `evil.com`. A check that only looks for
   * a leading `//` misses it completely.
   */
  it('rejects the protocol-relative form in both spellings', () => {
    expect(safeNextPath('//evil.com', { fallback })).toBe(fallback);
    expect(safeNextPath('/\\evil.com', { fallback })).toBe(fallback);
    expect(safeNextPath('/\\/evil.com', { fallback })).toBe(fallback);
    expect(safeNextPath('\\\\evil.com', { fallback })).toBe(fallback);
    expect(safeNextPath('/\\evil.com/grades', { fallback })).toBe(fallback);
  });

  it('rejects absolute and non-http URLs', () => {
    for (const value of [
      'https://evil.com',
      'http://evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:a@b.com',
    ]) {
      expect(safeNextPath(value, { fallback })).toBe(fallback);
    }
  });

  it('rejects control characters that could split a header', () => {
    expect(safeNextPath('/grades\r\nSet-Cookie: a=b', { fallback })).toBe(fallback);
    expect(safeNextPath('/grades\nLocation: https://evil.com', { fallback })).toBe(fallback);
    expect(safeNextPath('/grades\u0000', { fallback })).toBe(fallback);
  });

  it('rejects anything that is not a string or is empty', () => {
    for (const value of [null, undefined, '', 42, {}, [], true]) {
      expect(safeNextPath(value, { fallback })).toBe(fallback);
    }
  });

  /*
   * A signed-in user must not be able to send themselves back to the login form
   * through their own `next` value, which would otherwise loop.
   */
  it('refuses to bounce a signed-in user back to an auth page', () => {
    expect(safeNextPath('/login', { fallback })).toBe(fallback);
    expect(safeNextPath('/login?next=/grades', { fallback })).toBe(fallback);
    expect(safeNextPath('/register', { fallback })).toBe(fallback);
    expect(safeNextPath('/login/', { fallback })).toBe(fallback);
  });

  it('collapses a trailing slash so one rule covers both spellings', () => {
    expect(safeNextPath('/pricing/', { fallback })).toBe('/pricing');
  });

  it('does not mistake a similarly named path for an auth page', () => {
    expect(safeNextPath('/logins', { fallback })).toBe('/logins');
    expect(safeNextPath('/registered-students', { fallback })).toBe('/registered-students');
  });

  /*
   * The per-role gate is what stops a guardian deep-linking to /overview from
   * landing on the forbidden screen as their first page after signing in.
   */
  it('applies the caller-supplied permission gate', () => {
    const instructorOnly = (path: string) => path.startsWith('/overview');

    expect(safeNextPath('/overview', { fallback, allow: instructorOnly })).toBe('/overview');
    expect(safeNextPath('/history', { fallback, allow: instructorOnly })).toBe(fallback);
  });

  it('still refuses an off-origin path even when the gate would accept it', () => {
    const allowEverything = () => true;
    expect(safeNextPath('/\\evil.com', { fallback, allow: allowEverything })).toBe(fallback);
  });
});