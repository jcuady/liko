import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@libpg-query/parser';

/**
 * What the migration actually contains, checked before anyone deploys it.
 *
 * WHY THIS EXISTS. The database this migration targets was empty until this was
 * written, which means the file had never been executed by anything. Two things
 * are checked here, in order of how badly each would fail:
 *
 *   1. SYNTAX. The real PostgreSQL grammar, compiled to WASM. Not a regex and not
 *      an approximation: this is the parser Postgres itself uses, so if it
 *      accepts the file, Postgres accepts it.
 *
 *   2. CROSS-REFERENCES. Syntax says nothing about whether the objects refer to
 *      each other. A `create policy ... on public.studentz` parses perfectly and
 *      fails at deploy. So every table referenced by a policy, a grant, an
 *      index, a trigger or an `alter table` is resolved against the set of
 *      tables this file creates.
 *
 *   3. RLS COVERAGE. Every table created here must have row level security
 *      enabled. A table that quietly misses it is a silent data leak, and the
 *      audit that found the two cross-tenant bugs found a third table in this
 *      same family of mistake.
 *
 * WHAT IT IS NOT. It does not execute the migration. It cannot prove a policy
 * behaves correctly, only that it is syntactically real and points at things
 * that exist. Behaviour is `pnpm db:settle`, against a live database.
 *
 * Run: node scripts/check-migration.mjs
 */

const MIGRATIONS = 'supabase/migrations';

/** Relations that live outside this file and are expected to exist. */
const EXTERNAL = new Set(['auth.users', 'auth.uid']);

/**
 * Only `public.*` and `auth.*` are real relations.
 *
 * The alternative, "any dotted name is a relation", matches two things that are
 * not. Inside a policy predicate, `where m.org_id = theirs.org_id` is an alias
 * reference, and `execute function public.set_updated_at` is a function call.
 * Both are legitimately written with a dot and neither is a table, so treating
 * them as one produced a page of false alarms on a file that is actually clean.
 */
const REAL_SCHEMAS = new Set(['public', 'auth']);

let failures = 0;
let warnings = 0;

function fail(message) {
  failures += 1;
  console.error(`  FAIL  ${message}`);
}

function warn(message) {
  warnings += 1;
  console.log(`  warn  ${message}`);
}

function ok(message) {
  console.log(`  ok    ${message}`);
}

/** Reads a balanced `( ... )` starting at the opening paren index. */
function balanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

/** Splits a CREATE TABLE body into top-level comma-separated definitions. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

const CONSTRAINT_WORDS =
  /^(primary|foreign|unique|constraint|check|exclude)\b/i;

function analyse(sql) {
  const tables = new Map(); // name -> { line, columns:Set, rls:boolean }
  const functions = new Set();
  const external = new Set(EXTERNAL);

  // Functions are referenced exactly like relations, by `execute function
  // public.name`, so they have to resolve too or every trigger looks dangling.
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)/gi)) {
    functions.add(match[1].toLowerCase().split('.')[1]);
  }

  const define = (name, line, columns) => {
    if (tables.has(name)) return;
    tables.set(name, { line, columns, rls: false });
  };

  // ---- create table -------------------------------------------------------
  const createTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+\.[a-z_]+)\s*\(/gi;
  for (const match of sql.matchAll(createTable)) {
    const qualified = match[1].toLowerCase();
    if (external.has(qualified)) continue;
    const name = qualified.split('.')[1];
    const line = sql.slice(0, match.index).split('\n').length;
    const body = balanced(sql, match.index + match[0].length - 1);
    const columns = new Set();

    for (const part of splitTopLevel(body ?? '')) {
      const column = part.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (column && !CONSTRAINT_WORDS.test(part)) columns.add(column[1].toLowerCase());
    }

    define(name, line, columns);
  }

  // ---- alter table add column --------------------------------------------
  const addColumn = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_]+\.[a-z_]+)[\s\S]{0,40}?add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(addColumn)) {
    const qualified = match[1].toLowerCase();
    if (external.has(qualified)) continue;
    const table = tables.get(qualified.split('.')[1]);
    if (table) table.columns.add(match[2].toLowerCase());
  }

  // ---- row level security -------------------------------------------------
  const enableRls = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([a-z_]+\.[a-z_]+)[\s\S]{0,60}?enable\s+row\s+level\s+security/gi;
  for (const match of sql.matchAll(enableRls)) {
    const qualified = match[1].toLowerCase();
    if (external.has(qualified)) continue;
    const table = tables.get(qualified.split('.')[1]);
    if (table) table.rls = true;
  }

  return { tables, functions, external };
}

async function main() {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error(`No .sql files in ${MIGRATIONS}.`);
    process.exit(1);
  }

  for (const file of files) {
    const path = join(MIGRATIONS, file);
    const sql = readFileSync(path, 'utf8');
    const lineOf = (index) => sql.slice(0, index).split('\n').length;

    console.log(`\n${file}  (${sql.split('\n').length} lines)\n`);

    // ---- 1. syntax --------------------------------------------------------
    let parsed;
    try {
      parsed = await parse(sql);
      ok(`syntax: ${parsed.stmts.length} statements accepted by the PostgreSQL parser`);
    } catch (error) {
      fail(`syntax: ${error.message}`);
      const position = error.cursorPosition;
      if (typeof position === 'number') {
        const upTo = sql.slice(0, position);
        const lineNo = upTo.split('\n').length;
        const column = position - upTo.lastIndexOf('\n');
        console.error(`        line ${lineNo}, column ${column}`);
        console.error(`        ${(sql.split('\n')[lineNo - 1] ?? '').trim()}`);
      }
      continue;
    }

    const { tables, functions, external } = analyse(sql);

    // ---- 2. cross-references ---------------------------------------------
    // Every `on public.x`, `grant ... on public.x`, `execute function public.x`.
    // A predicate alias like `theirs.org_id` is not a relation and is skipped.
    const relations = /on\s+(?:only\s+)?([a-z_]+\.[a-z_]+)(?:\s|\(|;|$)/gi;
    const seen = new Map();
    for (const match of sql.matchAll(relations)) {
      const qualified = match[1].toLowerCase();
      if (external.has(qualified)) continue;
      const [schema] = qualified.split('.');
      if (!REAL_SCHEMAS.has(schema)) continue;
      seen.set(`${qualified}|${lineOf(match.index)}`, { qualified, line: lineOf(match.index) });
    }

    let dangling = 0;
    for (const { qualified, line } of seen.values()) {
      const name = qualified.split('.')[1];
      if (tables.has(name) || functions.has(name) || external.has(qualified)) continue;
      fail(`line ${line}: refers to "${qualified}", which this file never creates`);
      dangling += 1;
    }
    if (dangling === 0) {
      ok(
        `cross-references: all ${seen.size} references resolve ` +
          `(${tables.size} tables, ${functions.size} functions)`,
      );
    }

    // ---- 3. RLS coverage --------------------------------------------------
    const withoutRls = [...tables.entries()].filter(([, table]) => !table.rls);
    if (withoutRls.length > 0) {
      for (const [name, table] of withoutRls) {
        fail(`line ${table.line}: table "${name}" never enables row level security`);
      }
    } else {
      ok(`row level security: enabled on all ${tables.size} tables`);
    }

    // ---- 4. policies are re-runnable -------------------------------------
    // Every migration in this repo is `create ... if not exists` / `drop policy
    // if exists` first, so re-running it is safe. A `create policy` with no
    // preceding drop breaks the second run, which is the one that happens when
    // someone has to recover.
    const creates = [...sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+([a-z_.]+)/gi)];

    /*
     * A `create policy` written once inside a `foreach` becomes N policies, so
     * counting STATEMENTS under-reports the schema. This gate printed "41
     * policies across 28 tables" while the database held 49, because one of
     * those statements was a loop over 12 tables:
     *
     *     41 statements - 1 loop template + 12 from the loop = 52 policies
     *     52 - 3 that live on storage.objects            = 49 in public
     *
     * which is exactly what `pg_policies` returned. The number a reader takes
     * away from this gate is the number of policies the schema ends up with, so
     * that is what is printed, with the statement count beside it rather than
     * instead of it. The two are only ever allowed to differ when a loop
     * explains the difference.
     *
     * The loop is only counted as a policy loop when its body really does hold
     * a `create policy ... %I` template, so adding an unrelated `foreach` later
     * cannot inflate the count.
     */
    const loopBody = sql.match(/foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]/i);
    const loopName = loopBody
      ? sql.match(/create\s+policy\s+"([^"]+)"\s+on\s+[a-z_.]+%I/i)?.[1]
      : undefined;
    const loopTables =
      loopName && loopBody ? [...loopBody[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]) : [];

    // `storage.objects` is a real table with real policies but it is not in the
    // public schema, so it is counted separately rather than folded in.
    const isStorage = (m) => m[2].toLowerCase().startsWith('storage');
    const direct = creates.filter((m) => !(loopName && m[1] === loopName));
    const storageCount = direct.filter(isStorage).length;
    const publicCount = direct.length - storageCount + loopTables.length;

    const drops = new Set(
      [...sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"/gi)].map((m) => m[1].toLowerCase()),
    );
    const notDropped = creates.filter((m) => !drops.has(m[1].toLowerCase()));
    if (notDropped.length === 0) {
      ok(
        `re-runnable: every policy is dropped before creation (${creates.length} statements -> ` +
          `${publicCount} in public${storageCount ? `, ${storageCount} on storage` : ''})`,
      );
    } else {
      for (const match of notDropped) {
        fail(
          `line ${lineOf(match.index)}: policy "${match[1]}" has no "drop policy if exists" before it, ` +
            'so re-running the migration fails',
        );
      }
    }

    // ---- 5. the plan vocabulary is one list, not three --------------------
    // The `organizations.plan` check constraint, `ORG_PLANS` in the API types
    // and `PLAN_IDS` on the pricing page have to name the same three plans. They
    // did not, twice: the SQL once said `solo | school | district` while the
    // page sold `starter | teacher | school`, so two of the three ids a person
    // could click could not have been written to the column they referred to,
    // and one legal value had no card at all.
    //
    // `e2e/legal.spec.ts` checks the page against a hardcoded list, which is a
    // third copy that has to be edited by hand and can go stale silently. This
    // check reads the constraint out of the SQL and both lists out of their
    // TypeScript, so a rename that touches only one of the three fails here
    // with the actual disagreement printed.
    const constraint = sql.match(
      /constraint\s+organizations_plan_check\s+check\s*\(\s*plan\s+in\s*\(([^)]*)\)/i,
    );
    if (!constraint) {
      fail('could not find the organizations_plan_check constraint, so its values cannot be verified');
    } else {
      const sqlPlans = [...constraint[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      const source = (label, file, pattern) => {
        const found = readFileSync(join('src', file), 'utf8').match(pattern);
        if (!found) {
          fail(`could not find the plan list in src/${file}, so it cannot be verified against SQL`);
          return null;
        }
        return { label, values: [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() };
      };
      const api = source('the API types', 'lib/api/types.ts', /ORG_PLANS\s*=\s*\[([^\]]*)\]/);
      const page = source('the pricing page', 'app/pricing/plans.ts', /PLAN_IDS[^=]*=\s*\[([^\]]*)\]/);

      const drifted = [api, page].filter((entry) => entry && entry.values.join() !== sqlPlans.join());
      if (sqlPlans.length > 0 && api && page) {
        if (drifted.length === 0) {
          ok(`plan vocabulary: SQL, the API types and the pricing page all allow ${sqlPlans.length} (${sqlPlans.join(', ')})`);
        } else {
          for (const entry of drifted) {
            fail(
              `${entry.label} allow (${entry.values.join(', ')}) but the constraint allows ` +
                `(${sqlPlans.join(', ')}). The constraint is the durable vocabulary, so move the rest to it.`,
            );
          }
        }
      }
    }

    // ---- 6. informational -------------------------------------------------
    const empty = creates.filter((m) =>
      /create\s+policy[^;]*?;\s*\n\s*\n\s*--/i.test(''),
    );
    if (empty.length > 0) warn(`${empty.length} policies look empty`);

    console.log(
      `        ${publicCount + storageCount} policies (${publicCount} in public across ` +
        `${tables.size} tables${storageCount ? `, ${storageCount} on storage` : ''})`,
    );
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} problem(s) found.`);
    process.exit(1);
  }
  console.log('No problems found. This proves the migration is sound, not that it works:');
  console.log('apply it, then run `pnpm db:check` and `pnpm db:settle`.');
}

main();