import { describe, expect, it } from 'vitest';

import { cn } from './utils';

/**
 * `cn` is a shared primitive, and the bug this file exists for was invisible in
 * every screenshot: `tailwind-merge` deleted one of the two classes before the
 * element was created, so `CardTitle` was not bold and `DialogTitle` was the
 * same size as its body. Nothing that renders the page can report a class that
 * was never applied, so this has to be asserted here or not at all.
 */

describe('the typography scale survives a merge', () => {
  const sizes = ['display', 'h2', 'h3', 'h4', 'lead', 'body', 'meta', 'label'];
  const colours = ['text-ink', 'text-ink-muted', 'text-ink-subtle', 'text-accent'];

  /*
   * The regression, one pair at a time. Asserted as a set rather than a string
   * because the order `cn` returns them in is not part of the contract and a test
   * pinned to an order would fail on a harmless reordering.
   */
  it.each(sizes)('keeps text-%s alongside a colour', (size) => {
    for (const colour of colours) {
      const merged = cn(`text-${size}`, colour);
      expect(merged.split(' ')).toContain(`text-${size}`);
      expect(merged.split(' ')).toContain(colour);
    }
  });

  it('keeps the pair the shared primitives actually use', () => {
    // Verbatim from CardTitle and CardDescription, the two that were broken.
    expect(cn('text-h4 text-ink', '').split(' ')).toEqual(
      expect.arrayContaining(['text-h4', 'text-ink']),
    );
    expect(cn('text-meta text-ink-muted', '').split(' ')).toEqual(
      expect.arrayContaining(['text-meta', 'text-ink-muted']),
    );
  });

  it('still resolves a real conflict between two sizes', () => {
    // The whole point of cn. If the fix had been "stop merging" this would pass
    // and every component would become unable to override its own default.
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    expect(cn('text-h4', 'text-body')).toBe('text-body');
  });

  it('still resolves a real conflict between two colours', () => {
    expect(cn('text-ink', 'text-accent')).toBe('text-accent');
  });

  it('still resolves conflicts outside typography', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('rounded-[8px]', 'rounded-full')).toBe('rounded-full');
  });

  it('leaves Tailwind own size scale working', () => {
    // Appending to the default group must not replace it.
    expect(cn('text-xs', 'text-ink-muted').split(' ')).toEqual(
      expect.arrayContaining(['text-xs', 'text-ink-muted']),
    );
    expect(cn('text-base', 'text-[0.9375rem]')).toBe('text-[0.9375rem]');
  });

  it('lets a caller override a component default, which is the reason cn exists', () => {
    // Order is not part of the contract: tailwind-merge emits the winner of a
    // conflict last, so `cn('text-h4 text-ink', 'text-body')` comes back with the
    // colour first. What matters is which classes survive, not where they sit.
    const overridden = cn('text-h4 text-ink', 'text-body').split(' ');
    expect(overridden).toContain('text-body');
    expect(overridden).toContain('text-ink');
    expect(overridden).not.toContain('text-h4');

    // The override has to win the size without taking the colour with it, which
    // is precisely the pair the old configuration destroyed.
    const both = cn('text-h4 text-ink', 'text-body text-accent').split(' ');
    expect(both).toContain('text-body');
    expect(both).toContain('text-accent');
    expect(both).not.toContain('text-h4');
    expect(both).not.toContain('text-ink');
  });
});