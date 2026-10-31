#!/usr/bin/env node
/**
 * verify:dates — a date must be rendered in a zone that is the same on the
 * server and in the browser.
 *
 * THE DEFECT THIS EXISTS TO CATCH.
 *
 * A date rendered with the runtime's own locale and the runtime's own zone is
 * rendered TWICE: once by the server and once by the browser. The server runs
 * in UTC and the browser runs in the reader's zone, so a timestamp near
 * midnight falls on one day in one and on the next day in the other, the two
 * renders disagree, and React reports a hydration error. The visitor gets a
 * page that threw on the way in, and the page still LOOKS fine afterwards
 * because React repairs it.
 *
 * It was found by the live check and not by any local run, because the local
 * server and the local browser are in the same zone. The live check found it
 * on `/slides`: a deck edited at 20:58 UTC is the 26th in UTC and the 27th in
 * Manila, so the server wrote "26 Oct" and the browser wanted "27 Oct".
 *
 * THE RULE.
 *
 * Every date the application renders is rendered in a fixed zone and a fixed
 * locale. The house way to do that is `src/lib/dates.ts`, which pins both and
 * takes the zone as an argument, and the zone a component is given is the
 * institution's, from `useTenantZone()` or `tenantTimeZone()`.
 *
 * So this gate holds two things:
 *
 *  1. A date formatted with `toLocaleDateString`, `toLocaleTimeString`,
 *     `toLocaleString` or `Intl.DateTimeFormat` must pin a `timeZone`, or be
 *     one of the helpers in `src/lib/dates.ts`, which pin it.
 *  2. The locale must be pinned too. A reader in Germany and a reader in the
 *     Philippines would otherwise see different strings for the same day, and
 *     the server would have had to guess which one the reader wanted before it
 *     had heard from them.
 *
 * WHAT IT DOES NOT DO. It does not decide WHICH zone. That is the
 * institution's, and the gate only insists that it is fixed and that it is the
 * same on both sides.
 *
 * USAGE
 *   node scripts/verify-dates.mjs
 *   node scripts/verify-dates.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** The shared helper. It pins the zone and the locale, so it is the way. */
const HELPERS = [path.join(SRC, 'lib', 'dates.ts')];

const FORMATTERS = new Set([
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleString',
]);

function sourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.verify-role-guards-selftest') continue;
      sourceFiles(p, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Whether an options object pins the zone. */
function pinsZone(options) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  for (const property of options.properties) {
    // A shorthand property, `{ timeZone }`, is the same pin as
    // `{ timeZone: timeZone }`, and reading only the long form would call a
    // correctly written helper unpinned.
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text === 'timeZone') return true;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText().replace(/['"]/g, '');
    if (name === 'timeZone') return true;
  }
  return false;
}

/**
 * Whether the locale is pinned, rather than left to the runtime.
 *
 * `undefined` is the runtime's locale written out, and so is no argument at
 * all. Anything else is a locale the author chose, including a constant, so
 * it counts as pinned.
 */
function pinsLocale(node) {
  const first = node.arguments?.[0];
  if (!first) return false;
  if (ts.isIdentifier(first) && first.text === 'undefined') return false;
  return true;
}

/**
 * The findings in one file.
 *
 * A call is a finding when it formats a date without pinning the zone, or
 * without pinning the locale.
 */
function findingsIn(file) {
  const sf = parse(file);
  const findings = [];

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (FORMATTERS.has(method)) {
        const options = node.arguments?.[1];
        if (!pinsZone(options)) {
          findings.push({
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            what: `a date formatted without a fixed zone (${method})`,
          });
        } else if (!pinsLocale(node)) {
          findings.push({
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            what: `a date formatted with the runtime's locale (${method})`,
          });
        }
      }
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Intl' &&
      node.arguments?.[0] &&
      ts.isPropertyAccessExpression(node.arguments[0]) &&
      node.arguments[0].name.text === 'DateTimeFormat'
    ) {
      const options = node.arguments?.[1];
      if (!pinsZone(options)) {
        findings.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          what: 'a date formatted without a fixed zone (Intl.DateTimeFormat)',
        });
      } else if (!pinsLocale(node)) {
        findings.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          what: "a date formatted with the runtime's locale (Intl.DateTimeFormat)",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  return findings;
}

/** Every file that formats a date, and what it does about the zone. */
function scan() {
  const files = sourceFiles(SRC);
  const offenders = [];
  let calls = 0;

  for (const file of files) {
    if (HELPERS.includes(file)) continue;
    const found = findingsIn(file);
    if (found.length) {
      offenders.push({ file: rel(file), found });
    }
    calls += countFormatters(file);
  }

  return { files: files.length, calls, offenders };
}

function countFormatters(file) {
  const sf = parse(file);
  let calls = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (FORMATTERS.has(node.expression.name.text)) calls += 1;
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Intl' &&
      node.arguments?.[0] &&
      ts.isPropertyAccessExpression(node.arguments[0]) &&
      node.arguments[0].name.text === 'DateTimeFormat'
    ) {
      calls += 1;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return calls;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---------------------------------------------------------------- self-test

/**
 * A gate with no fixture cannot be shown to fail.
 *
 * The fixtures are the two ways a date goes wrong and the one way it goes
 * right, written to disk and read back, so the gate is proved against the
 * same code path it uses on the repository.
 */
function selfTest() {
  const dir = path.join(SRC, '.verify-dates-selftest');
  fs.mkdirSync(dir, { recursive: true });

  const cases = [
    {
      name: 'a date formatted with no zone',
      source: `export function show(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric' });
}
`,
      expect: 1,
    },
    {
      name: 'a date formatted with the runtime locale and no zone',
      source: `export function show(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric' });
}
`,
      expect: 1,
    },
    {
      name: 'a date formatted with a zone and a pinned locale',
      source: `export function show(iso: string, zone: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', timeZone: zone });
}
`,
      expect: 0,
    },
    {
      name: 'a formatter built with a zone',
      source: `const FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });
export { FORMAT };
`,
      expect: 0,
    },
    {
      name: 'a date whose locale comes from a constant',
      source: `const LOCALE = 'en-GB';
export function show(iso: string, zone: string) {
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', timeZone: zone });
}
`,
      expect: 0,
    },
    {
      name: 'a date whose locale is the runtime written out',
      source: `export function show(iso: string, zone: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', timeZone: zone });
}
`,
      expect: 1,
    },
  ];

  let ok = true;
  for (const [index, testCase] of cases.entries()) {
    const file = path.join(dir, `case-${index}.ts`);
    fs.writeFileSync(file, testCase.source, 'utf8');
    const found = findingsIn(file).length;
    if (found !== testCase.expect) {
      ok = false;
      console.log(`FAIL  ${testCase.name}: expected ${testCase.expect} finding(s), got ${found}`);
    }
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a temp directory is not worth a failed gate */
  }

  if (ok) console.log(`PASS  self-test: ${cases.length} formatting cases classified as expected`);
  return ok;
}

// -------------------------------------------------------------------- main

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1);
}

const { files, calls, offenders } = scan();

console.log(
  `verify:dates — ${files} source file(s), ${calls} date formatting call(s) read\n`,
);

if (!calls) {
  console.log('FAIL  no date formatting was found, so the scan looked at nothing.');
  process.exit(1);
}

for (const offender of offenders) {
  console.log(`${offender.file}`);
  for (const finding of offender.found) {
    console.log(`  ${finding.line}: ${finding.what}`);
  }
}

if (offenders.length) {
  console.log(
    `\nFAIL  ${offenders.length} file(s) format a date without a fixed zone and locale.`,
  );
  console.log('      Use src/lib/dates.ts, with the institution zone from useTenantZone().');
  process.exit(1);
}

console.log('\nPASS  every date is formatted in a fixed zone and a fixed locale.');
