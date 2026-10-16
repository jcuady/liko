import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A repository-wide guard against mojibake in visible copy.
 *
 * WHY THIS IS A TEST AND NOT A LINT RULE. Twice now a stray character has
 * reached a rendered string in this product: the weekly grid printed a stray
 * letter A before its middle dot, and a flashcard review session printed its
 * "N left" counter with a stray letter A in front of the separator, to every
 * student studying. Neither was caught by the type checker, the linter, or the
 * several hundred unit tests in this project, because a mojibake character is a
 * perfectly well-formed string. Every gate was green while the product was wrong
 * in front of a user.
 *
 * The characters are described here rather than reproduced. This file would
 * otherwise be the one place in the repository that has to be allow-listed, and
 * a guard that exempts itself is not obviously still a guard.
 *
 * WHAT IT MATCHES. UTF-8 bytes that were decoded as Latin-1 arrive as U+00C2 or
 * U+00C3 followed by a byte in U+0080 to U+00BF. That pairing is the signature:
 * a real middle dot is U+00B7 alone, and no legitimate copy in this product
 * contains Ã or Â followed by one of those.
 *
 * THE ALLOW LIST IS EXPLICIT AND REASONED. A guard that quietly ignores a
 * pattern is worse than no guard, because it reads as coverage. Each entry names
 * the file and why the mojibake has to be there.
 */

const ROOT = join(__dirname, '..', '..');
const SCAN = ['src', 'e2e'];
const EXTENSIONS = ['.ts', '.tsx'];

/** UTF-8 read as Latin-1: a lead character followed by the mangled byte. */
const MOJIBAKE = /[\u00C2-\u00C3][\u0080-\u00BF]/g;

const ALLOWED: Record<string, string> = {
  'e2e/schedule.spec.ts':
    'Names the mojibake on purpose, in the comment that records the weekly-grid ' +
    'bug, and asserts in one line that the string does not appear on the page. ' +
    'Deleting either would remove the regression test.',
};

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(full);
  }
  return found;
}

describe('source encoding', () => {
  it('has no mojibake in any file the product renders', () => {
    const offenders: string[] = [];

    for (const dir of SCAN) {
      for (const file of walk(join(ROOT, dir))) {
        const relative = file.slice(ROOT.length + 1).split('\\').join('/');
        if (ALLOWED[relative]) continue;

        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(MOJIBAKE)) {
          const line = source.slice(0, match.index).split('\n').length;
          const codepoint = (match[0].codePointAt(0) ?? 0)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0');
          offenders.push(
            `${relative}:${line} U+${codepoint} U+${match[0]
              .codePointAt(1)!
              .toString(16)
              .toUpperCase()
              .padStart(4, '0')}`,
          );
        }
      }
    }

    expect(
      offenders,
      `UTF-8 was decoded as Latin-1 in ${offenders.length} place(s), which renders as a stray character in the product`,
    ).toEqual([]);
  });

  it('allow-lists only files that still exist', () => {
    // A stale entry hides a file nobody is checking any more, which is the
    // failure mode this whole test exists to prevent.
    for (const [relative, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, `${relative} needs a reason`).toBeGreaterThan(0);
      expect(() => statSync(join(ROOT, relative)), `${relative} is allow-listed but missing`).not.toThrow();
    }
  });
});