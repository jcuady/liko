import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { announceAssertively } from './toast';

/**
 * The assertive announcement for error toasts.
 *
 * Sonner 2.0.8 has exactly one `aria-live` in its whole dist bundle, it is
 * `polite`, and it applies to every toast. There is no prop to change that and
 * no exported subscription hook, so `toast.error` is the only place this
 * behaviour can live. That makes three things worth pinning, and none of them
 * are about the function.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * Remove comments before a negative assertion.
 *
 * A comment explaining why a construct is absent necessarily names it, so an
 * assertion like `not.toContain('role="alert"')` fails on correct code and the
 * only way to make it pass is to delete the explanation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function installRegion(): { textContent: string | null } {
  const region = { textContent: '' };
  vi.stubGlobal('document', { getElementById: () => region });
  vi.stubGlobal('window', { setTimeout: (fn: () => void) => fn() });
  return region;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('announceAssertively', () => {
  it('writes the message into the region', () => {
    const region = installRegion();

    announceAssertively('That could not be saved.');

    expect(region.textContent).toBe('That could not be saved.');
  });

  it('clears before writing so an identical repeat is announced again', () => {
    const region = installRegion();

    announceAssertively('Same failure.');
    // A live region whose text does not change is not re-announced, and pressing
    // the same failing button twice is the most common way to meet this.
    announceAssertively('Same failure.');

    expect(region.textContent).toBe('Same failure.');
  });

  it('does nothing when no region is mounted', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal('window', { setTimeout: () => {} });

    expect(() => announceAssertively('Nowhere to put this.')).not.toThrow();
  });
});

describe('the region id is declared in two places, so it is checked', () => {
  const idIn = (relative: string): string | null => {
    const source = readFileSync(join(ROOT, relative), 'utf8');
    return source.match(/liko-assertive-toasts/)?.[0] ?? null;
  };

  it('the writer and the renderer name the same region', () => {
    // If either string is renamed and the other is not, every error toast goes
    // back to being announced politely and nothing fails, because a live region
    // that is never written is silent rather than broken.
    expect(idIn('src/lib/toast.ts')).toBe('liko-assertive-toasts');
    expect(idIn('src/components/providers/ToastProvider.tsx')).toBe('liko-assertive-toasts');
  });

  it('the renderer uses assertive and never role="alert"', () => {
    // Comments are stripped first. The comment in that file explains why the
    // role is absent and therefore names it, and a negative assertion that
    // matches the comment fails on correct code for a reason unrelated to the
    // claim being made.
    const source = stripComments(
      readFileSync(join(ROOT, 'src/components/providers/ToastProvider.tsx'), 'utf8'),
    );
    expect(source).toContain('aria-live="assertive"');
    // A permanently present role="alert" region matches every [role="alert"]
    // query in the suite, and an empty one satisfies a count assertion that was
    // meant to be about a real error. The assertive region must not be that.
    expect(source).not.toContain('role="alert"');
  });
});

describe('the wrapper is not bypassed', () => {
  it('no call site imports toast straight from sonner', () => {
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          const relative = full.slice(ROOT.length + 1).split('\\').join('/');
          // The wrapper itself is the one place allowed to import from sonner.
          if (relative === 'src/lib/toast.ts') continue;
          if (/import\s*\{[^}]*\btoast\b[^}]*\}\s*from\s*'sonner'/.test(readFileSync(full, 'utf8'))) {
            offenders.push(relative);
          }
        }
      }
    };
    walk(join(ROOT, 'src'));

    expect(
      offenders,
      `these import toast from sonner, so their errors stay polite: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});