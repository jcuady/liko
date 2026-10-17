import { describe, expect, it } from 'vitest';

import { relativeTime } from './relative-time';

/**
 * How old a notification is, in words.
 *
 * The boundaries are the whole of it. A formatter that rounds instead of
 * truncating says "1 hours ago" and "in -2 minutes"; one that guesses a
 * singular says "1 days ago". Every case below is a place where those two
 * mistakes are visible, and the future cases are here because the column is a
 * plain `timestamptz` written by a database clock that is not this machine's.
 */

const NOW = new Date('2026-03-10T12:00:00Z');
const at = (iso: string) => relativeTime(iso, NOW);

function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('relativeTime', () => {
  it('says just now rather than counting seconds', () => {
    expect(at(ago(0))).toBe('Just now');
    expect(at(ago(45))).toBe('Just now');
    // 59.9 seconds must not round up into a minute.
    expect(at(ago(59.9))).toBe('Just now');
  });

  it('counts whole minutes and keeps the singular', () => {
    expect(at(ago(60))).toBe('1 min ago');
    expect(at(ago(119))).toBe('1 min ago');
    expect(at(ago(120))).toBe('2 min ago');
    expect(at(ago(59 * 60))).toBe('59 min ago');
  });

  it('counts whole hours and keeps the singular', () => {
    expect(at(ago(60 * 60))).toBe('1 hour ago');
    expect(at(ago(60 * 60 * 2 + 61))).toBe('2 hours ago');
    // 23h59m is not yet a day.
    expect(at(ago(23 * 60 * 60 + 59 * 60))).toBe('23 hours ago');
  });

  it('counts whole days and keeps the singular', () => {
    expect(at(ago(24 * 60 * 60))).toBe('1 day ago');
    expect(at(ago(6 * 24 * 60 * 60))).toBe('6 days ago');
    // Just under a week is still a day count.
    expect(at(ago(7 * 24 * 60 * 60 - 60))).toBe('6 days ago');
  });

  it('gives a date once the week has turned over', () => {
    const old = at(ago(7 * 24 * 60 * 60));
    expect(old).not.toMatch(/ago/);
    expect(old).toContain('2026');
  });

  it('does not say a notification is in the future', () => {
    // Clock skew between the writer and this machine is a fact, not a bug, and
    // the alternative is a student reading "in 3 minutes".
    expect(at(new Date(NOW.getTime() + 5 * 60 * 1000).toISOString())).toBe('Just now');
    expect(at(new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      'Just now',
    );
  });

  it('passes an unparseable value through instead of printing NaN', () => {
    expect(at('not a date')).toBe('not a date');
    expect(at('')).toBe('');
  });
});