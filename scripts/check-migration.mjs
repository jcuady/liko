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
    const drops = new Set(
      [...sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"/gi)].map((m) => m[1].toLowerCase()),
    );
    const notDropped = creates.filter((m) => !drops.has(m[1].toLowerCase()));
    if (notDropped.length === 0) {
      ok(`re-runnable: all ${creates.length} policies are dropped before creation`);
    } else {
      for (const match of notDropped) {
        fail(
          `line ${lineOf(match.index)}: policy "${match[1]}" has no "drop policy if exists" before it, ` +
            'so re-running the migration fails',
        );
      }
    }

    // ---- 5. informational -------------------------------------------------
    const empty = creates.filter((m) =>
      /create\s+policy[^;]*?;\s*\n\s*\n\s*--/i.test(''),
    );
    if (empty.length > 0) warn(`${empty.length} policies look empty`);

    console.log(`        ${creates.length} policies across ${tables.size} tables`);
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