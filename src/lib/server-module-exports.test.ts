import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `'use server'` module may only export async functions.
 *
 * Anything else exported from one is replaced, on the client, by a reference
 * proxy object. That is silent: the import resolves, the value has the wrong
 * shape, and the page only fails when the bad value is actually used. This
 * happened twice. `ASSESSMENT_TYPES` was fixed by moving it to `assess/options.ts`,
 * and `SEVERITY_OPTIONS` was still sitting in `history/actions.ts`, which made
 * `SEVERITY_OPTIONS.map` throw and dropped `/history` into the error boundary
 * for every signed-in user. No test visited that route with a session, so it
 * shipped.
 *
 * This scans the tree so the third instance cannot.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isServerModule(src: string): boolean {
  return /^['"]use server['"];?$/m.test(src.split('\n').slice(0, 3).join('\n'));
}

/** Exports that are erased at compile time, so they cannot reach a client. */
const TYPE_ONLY = /^export\s+(interface|type)\s/;

const ILLEGAL = /^export\s+(const|let|var|class|function)\s/;

const LEGAL = [/^export\s+async\s+function\s/, /^export\s+default\s/];

describe("'use server' modules export only async functions", () => {
  const violations: string[] = [];
  let serverModules = 0;

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!isServerModule(src)) continue;
    serverModules += 1;

    src.split('\n').forEach((line, index) => {
      const text = line.trim();
      if (TYPE_ONLY.test(text)) return;
      if (LEGAL.some((pattern) => pattern.test(text))) return;
      if (ILLEGAL.test(text)) {
        violations.push(`${file}:${index + 1}  ${text.slice(0, 80)}`);
      }
    });
  }

  it('found the server-action modules it is meant to guard', () => {
    // If this ever reads 0 the scan has silently stopped working, which would
    // make the assertion below pass for the wrong reason.
    expect(serverModules).toBeGreaterThan(0);
  });

  it('has no non-function exports', () => {
    expect(violations).toEqual([]);
  });
});