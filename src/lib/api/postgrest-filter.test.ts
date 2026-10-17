import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { __resolveCurrentStudentId } from './client';

/**
 * PostgREST's `is` operator is not "equals", and this file exists because it
 * cost a production page.
 *
 * `calendar_events` was read with `.is('student_id', studentId)`. For a teacher
 * `studentId` is `null`, which renders `student_id=is.null` and is correct. For
 * a student it is a uuid, which renders `student_id=is.<uuid>`, and PostgREST
 * rejects the whole query with PGRST100: "unexpected 3 expecting isVal: (null,
 * not_null, true, false, unknown)". `is` means "is exactly null" or "is exactly
 * true", never "is this value".
 *
 * So `/schedule` was dead for every student in the real deployment: the server
 * threw, the page hit its error boundary, and React surfaced it as minified
 * error #441. Not one test caught it, because every browser test drives the
 * fixtures and no unit test constructs a PostgREST URL.
 */

/**
 * The file's own source, with comments removed.
 *
 * A line-based state machine rather than two regexes, because the regex version
 * could not tell a `//` inside a string from a comment, and a source guard that
 * guesses is a source guard that will be quiet at the wrong moment.
 *
 * WHY STRIP AT ALL. The fix for this bug explains the bug by naming the line it
 * removed, so a scan that reads prose reports a defect in code that is already
 * correct. That is the general trap: **a comment explaining an absence
 * necessarily names the thing absent**, so any negative source assertion has to
 * strip comments before it looks, or it will spend its life finding the very
 * things it was written to explain away.
 */
export function stripComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;

  for (const raw of source.split('\n')) {
    let line = '';
    let inString: '"' | "'" | '`' | null = null;
    let i = 0;

    while (i < raw.length) {
      const two = raw.slice(i, i + 2);

      if (inBlock) {
        if (two === '*/') {
          inBlock = false;
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }

      if (inString) {
        line += raw[i];
        if (raw[i] === '\\') {
          line += raw[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (raw[i] === inString) inString = null;
        i += 1;
        continue;
      }

      if (two === '/*') {
        inBlock = true;
        i += 2;
        continue;
      }
      if (two === '//') break;
      if (raw[i] === '"' || raw[i] === "'" || raw[i] === '`') {
        inString = raw[i] as '"' | "'" | '`';
      }
      line += raw[i];
      i += 1;
    }

    const trimmed = line.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }

  return out;
}

function codeLines(): string[] {
  return stripComments(readFileSync(join(process.cwd(), 'src', 'lib', 'api', 'client.ts'), 'utf8'));
}

describe('the comment stripper this guard depends on', () => {
  it('removes line and block comments', () => {
    const out = stripComments(
      [
        "const a = 1; // trailing",
        '/* leading',
        ' * still a comment',
        ' */',
        'const b = 2;',
      ].join('\n'),
    );
    expect(out).toEqual(['const a = 1;', 'const b = 2;']);
  });

  it('keeps a // inside a string', () => {
    // A URL in a doc string is the common case and the one a naive regex eats.
    expect(stripComments("const u = 'https://x.test';").join('')).toContain('https://x.test');
  });

  it('swallows what follows an unclosed block comment', () => {
    /*
     * Which is correct, and worth pinning because it is the one input that
     * could make this guard lie. An unterminated `/*` means everything after it
     * IS a comment, so stripping it is right.
     *
     * It cannot happen here: the file being scanned is TypeScript that
     * typechecks, so every block comment is closed, and this test is here so
     * that if that ever changes somebody reads the behaviour deliberately
     * rather than discovering it as a silently empty guard.
     */
    expect(stripComments('/* open\nconst real = 1;').join('')).not.toContain('const real = 1;');
    expect(stripComments('/* open */\nconst real = 1;').join('')).toContain('const real = 1;');
  });
});

describe('PostgREST is-vs-eq, as this repo uses them', () => {
  const lines = codeLines();

  it('never passes a variable to .is(), which only accepts null or a literal', () => {
    /*
     * `.is(col, null)` is the one legal call. `.is(col, 'not.is.null')` is a
     * deliberate PostgREST idiom and also legal, because the value is a literal
     * the operator itself understands. Anything else means a value at runtime,
     * and that value will be sent as `col=is.<value>`, which PostgREST answers
     * with PGRST100 rather than a row.
     */
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /\.is\('/.test(line))
      .filter(({ line }) => {
        const value = line.slice(line.indexOf('.is(') + 4);
        const arg = value.slice(value.indexOf(',') + 1).trim().replace(/[,)].*$/, '');
        return arg !== 'null' && !/^'[^']*'\s*$/.test(arg) && !/^"[^"]*"\s*$/.test(arg);
      });

    expect(
      offenders,
      `.is() with a value PostgREST will not accept: ${offenders
        .map((o) => `stripped line ${o.number}: ${o.line}`)
        .join(' | ')}`,
    ).toEqual([]);
  });

  it('keeps the two legal shapes this file allows', () => {
    // Guard against the guard becoming the thing that is wrong: if someone
    // "simplifies" .eq to .is everywhere, the scan above would go quiet and the
    // check would report a clean bill of health for a broken adapter.
    expect(lines.filter((line) => /\.eq\('student_id'/.test(line)).length).toBeGreaterThan(0);
    expect(lines.filter((line) => /\.is\('[a-z_]+', null\)/.test(line)).length).toBeGreaterThan(0);
  });

  it('never falls back to an empty string inside .eq()', () => {
    /*
     * The same trap, one layer down, and proved rather than assumed.
     *
     * Measured against the live database:
     *   .eq('owner_id', '')   -> 22P02 invalid input syntax for type uuid: ""
     *   .in('class_id', [])   -> no error, zero rows
     *   .is('id', '<uuid>')   -> PGRST100 failed to parse filter
     *
     * `?? ''` is the reflex when an id might be missing, and it is the correct
     * reflex for a text column and a 22P02 crash for a uuid one. The two are
     * indistinguishable in the source, so the adapter has none.
     *
     * SCOPE, stated so the guard is not read as more than it is. This matches a
     * fallback written on the same line as the `.eq()`, which is where the reflex
     * actually lands. An empty value computed on an earlier line and passed in
     * under a name would pass this scan, which is why the behavioural tests below
     * assert the built query rather than the text that builds it.
     */
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /\.eq\('/.test(line) && /(\?\?|\|\|)\s*(''|"")/.test(line));

    expect(
      offenders,
      `.eq() with an empty-string fallback: ${offenders
        .map((o) => `stripped line ${o.number}: ${o.line}`)
        .join(' | ')}`,
    ).toEqual([]);
  });

  it('leaves no comment markers behind in what it scans', () => {
    expect(lines.some((line) => line.startsWith('//'))).toBe(false);
    expect(lines.some((line) => line.startsWith('*'))).toBe(false);
  });
});

/**
 * The scan above reads text. This reads behaviour, because the defect it
 * exists to catch was never in the characters: it was in a branch that built a
 * query it should have declined to build, and only running the function shows
 * which branch it takes.
 */
describe('resolving the roster row for the signed-in account', () => {
  const UUID = '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

  function stub(options: {
    userId: string | null;
    getUserError?: unknown;
    rows: Record<string, unknown> | null;
  }) {
    const eqCalls: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return query;
      },
      is: () => query,
      maybeSingle: async () => ({ data: options.rows, error: null }),
    };
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: options.userId ? { id: options.userId } : null },
          error: options.getUserError ?? null,
        }),
      },
      from: () => query,
    };
    return {
      eqCalls,
      resolve: () =>
        __resolveCurrentStudentId(client as unknown as Parameters<typeof __resolveCurrentStudentId>[0]),
    };
  }

  it('never sends an empty string to a uuid column', async () => {
    /*
     * The defect, as a behaviour. `account_id` is a uuid, and Postgres answers
     * `22P02 invalid input syntax for type uuid: ""` rather than an empty
     * result, so a caller that assumed "no rows" was reading a crash.
     */
    const noSession = stub({ userId: null, rows: null });
    await expect(noSession.resolve()).rejects.toThrow(/No Supabase session/);
    expect(noSession.eqCalls).toEqual([]);

    const live = stub({ userId: UUID, rows: { id: 'stu_001' } });
    expect(await live.resolve()).toBe('stu_001');
    expect(live.eqCalls).toEqual([['account_id', UUID]]);
  });

  it('returns null for a signed-in account with no roster row', async () => {
    /*
     * The documented contract, and the reason this function returns null at all:
     * a teacher holding no review schedule is an ordinary state, not an error.
     * It is worth pinning because it is the answer that must NOT change when the
     * no-session case starts throwing.
     */
    const teacher = stub({ userId: UUID, rows: null });
    expect(await teacher.resolve()).toBeNull();
    expect(teacher.eqCalls).toEqual([['account_id', UUID]]);
  });

  it('surfaces a failed session lookup instead of querying with what it returned', async () => {
    const broken = stub({ userId: null, getUserError: new Error('Auth session missing!'), rows: null });
    await expect(broken.resolve()).rejects.toThrow('Auth session missing!');
    expect(broken.eqCalls).toEqual([]);
  });
});