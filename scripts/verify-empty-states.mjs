#!/usr/bin/env node
/**
 * verify:empty-states — a class-scoped page must not tell a reader to do
 * something the reader's role cannot do.
 *
 * THE DEFECT THIS EXISTS TO CATCH.
 *
 * `/grades`, `/plan` and `/assess` render the shared `NoClassesYet` component
 * when the account can see no classes. `/history`, `/overview`, `/attendance`
 * and the classes page each hand-rolled the same paragraph instead, and all of
 * them told the reader to "Create a class first". That is an instruction to a
 * role that cannot carry it out: a guardian holds `class:write` at `no` and a
 * student holds `no`, so both were told to do something the application would
 * refuse them.
 *
 * It shipped because the page rendered. The copy was wrong in a way that only
 * a reader in the wrong role would ever see.
 *
 * AND IT WAS REACHABLE. `archiveStudent` sets `archived_at` and leaves
 * `account_id` alone, while the "linked read classes" policy requires
 * `s.archived_at is null`. An archived student's seat therefore reads zero
 * classes, `history:read` is `own`, so they reach `/history`, and the page told
 * them to create a class. A student is the one role in this product that will
 * never be able to.
 *
 * WHY THE MATRIX IS READ FROM THE SOURCE AND NOT COPIED.
 *
 * The rule is a property of two things at once: the copy on the page, and the
 * roles that can reach the page. Both live in the repository, and `rbac.ts`
 * says of itself: "Both must consult this file, never a local copy." A gate
 * that kept its own table of scopes would be a third copy, and it would drift
 * the moment a permission changed. So this reads `MATRIX` out of
 * `src/lib/auth/rbac.ts` with the TypeScript compiler and implements `can()`
 * exactly as the application does: a scope of `no` is refused, and an
 * ownership scope counts as permitted.
 *
 * WHY IT FOLLOWS THE COMPONENTS A PAGE RENDERS.
 *
 * The copy is rarely in the page. `/classes` is a thin server component and
 * the empty state lives in `ClassesManager`, a client component it renders.
 * A gate that only read the page files would have found nothing at all, and
 * the defect it was written for is in exactly that component. So each page
 * pulls in its own render closure, the local components it imports, and every
 * one of their class-scoped empty states is examined against the PAGE's
 * permission.
 *
 * TWO INSTRUMENT BUGS THIS FILE ALREADY HAD, both of which made it unable to
 * fail, and both found by running it against the real tree rather than by
 * reading it:
 *
 *  1. It read only the FIRST class-scoped branch in a file. `ClassesManager`
 *     has two: the summary sentence, "Nothing yet.", and the empty state
 *     below it, "Create one and everything else attaches to it." The first
 *     has no invitation in it and the second is the whole defect, so the gate
 *     reported the file clean.
 *
 *  2. It read only the page files, for the reason given above.
 *
 * WHAT IT ASSERTS, AND WHY IT IS NOT "USE THE COMPONENT".
 *
 * The property is that no reader is told to create a class they cannot
 * create. A page that renders the shared component satisfies it by
 * construction, because that component's copy is role-aware. A page that
 * hand-rolls its copy satisfies it ONLY if every role that can reach the page
 * is allowed to create a class. `/overview` and `/attendance` hand-roll theirs
 * and still pass, because only an instructor or an administrator can reach
 * them and both hold `class:write`. Asserting the mechanism would have failed
 * two correct pages and taught the next person that the component is the rule
 * rather than the reason.
 *
 * USAGE
 *   node scripts/verify-empty-states.mjs
 *   node scripts/verify-empty-states.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'src', 'app');
const RBAC = path.join(ROOT, 'src', 'lib', 'auth', 'rbac.ts');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ES2022,
    true,
    /*
     * The script kind has to follow the extension, and the test is `'.tsx'`,
     * NOT `'.x'`. `'foo.tsx'.endsWith('.x')` is false, because the last two
     * characters are `sx`. A `.tsx` file parsed as plain TypeScript cannot
     * parse JSX at all, so every JSX text and every component name came back
     * empty and the gate reported clean files that were full of copy.
     *
     * That regression was introduced by "tidying" a hardcoded `ScriptKind.TSX`
     * into a conditional, and the self-test caught it on the next run. Which
     * is the argument for having a self-test at all: the gate had been
     * reporting a defect correctly minutes earlier, and only the fixture
     * proved the tidying had broken it.
     */
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * The permission matrix, read out of `rbac.ts`.
 *
 * The AST is used rather than a regex because the object is large and a
 * hand-rolled matcher would happily read the wrong role's row.
 */
function readMatrix() {
  const sf = parse(RBAC);
  let matrix = null;

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'MATRIX' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      matrix = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  if (!matrix) throw new Error('could not find MATRIX in rbac.ts');

  const out = {};
  for (const roleProp of matrix.properties) {
    if (!ts.isPropertyAssignment(roleProp) || !ts.isObjectLiteralExpression(roleProp.initializer)) {
      continue;
    }
    const role = roleProp.name.getText(sf).replace(/['"]/g, '');
    out[role] = {};
    for (const permProp of roleProp.initializer.properties) {
      if (!ts.isPropertyAssignment(permProp)) continue;
      const permission = permProp.name.getText(sf).replace(/['"]/g, '');
      const scope = permProp.initializer.getText(sf).replace(/['"]/g, '');
      out[role][permission] = scope;
    }
  }
  return out;
}

/** Exactly the application's rule: a scope of `no` is refused. */
const can = (matrix, role, permission) =>
  Boolean(matrix[role]?.[permission]) && matrix[role][permission] !== 'no';

/** The permission a page demands, read from its own `requirePagePermission` call. */
function pagePermission(sf) {
  let found = null;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'requirePagePermission' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found = node.arguments[0].text;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** The module specifiers a file imports. */
function importSpecifiers(sf) {
  const out = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      out.push(stmt.moduleSpecifier.text);
    }
  }
  return out;
}

/** Resolve a relative or `@/` specifier to a file, or null. */
function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(ROOT, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * The page and every local component it renders.
 *
 * The closure is what makes the copy findable, because the copy is rarely in
 * the page: `/classes` is a thin server component and the empty state is in
 * `ClassesManager`, which it renders.
 */
function renderClosure(file, seen = new Set(), depth = 0) {
  if (seen.has(file) || depth > 6) return seen;
  seen.add(file);

  let sf;
  try {
    sf = parse(file);
  } catch {
    return seen;
  }
  for (const specifier of importSpecifiers(sf)) {
    const target = resolveModule(file, specifier);
    if (target && /\.tsx?$/.test(target) && target.startsWith(path.join(ROOT, 'src'))) {
      renderClosure(target, seen, depth + 1);
    }
  }
  return seen;
}

/**
 * The visible copy of a branch, and whether it renders the shared component.
 */
function readBranch(branch) {
  const text = [];
  let usesShared = false;

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      /*
       * A self-closing element keeps its tag name on `tagName`; an element
       * with children keeps it on `openingElement.tagName`. Reading only
       * `openingElement` finds the tag of `<NoClassesYet ... />` undefined, and
       * the shared component is nearly always written self-closing.
       */
      const tag = node.openingElement?.tagName ?? node.tagName;
      const name = tag?.getText?.() ?? '';
      if (name === 'NoClassesYet') {
        // The shared component's own copy is role-aware, so it is not part of
        // the hand-rolled text this branch shows.
        usesShared = true;
        return;
      }
    }
    if (ts.isJsxText(node)) {
      const trimmed = node.text.replace(/\s+/g, ' ').trim();
      if (trimmed) text.push(trimmed);
    }
    if (ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent)) {
      // The copy an author typed, not the class names they typed it into. A
      // `className` attribute is styling, and printing it turns the failure
      // message into a wall of Tailwind.
      const attribute = node.parent.name.text;
      if (attribute !== 'className') text.push(node.text);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(branch, visit);
  return { text: text.join(' '), usesShared };
}

/**
 * A branch is about "this account can see no classes" when its condition says
 * exactly that. `quizzes.length === 0` is a different empty state and must not
 * be swept in, so the match is specific rather than a general emptiness test.
 */
function isNoClassesCondition(text) {
  return (
    /classes\.length\s*===\s*0/.test(text) ||
    /^\!\s*selected$/.test(text) ||
    /^\!\s*classes$/.test(text) ||
    /^\!\s*roster$/.test(text)
  );
}

/**
 * EVERY class-scoped empty state in a file, not just the first.
 *
 * `ClassesManager` has two branches on `classes.length === 0`: the summary
 * sentence, which says "Nothing yet.", and the empty state under it, which
 * says "Create one and everything else attaches to it." Reading only the first
 * made the file look clean while the defect sat in the second.
 */
function noClassesBranches(sf) {
  const branches = [];
  const visit = (node) => {
    if (ts.isIfStatement(node) && isNoClassesCondition(node.expression.getText(sf).replace(/\s+/g, ' ').trim())) {
      branches.push(readBranch(node.thenStatement));
    }
    if (
      ts.isConditionalExpression(node) &&
      isNoClassesCondition(node.condition.getText(sf).replace(/\s+/g, ' ').trim())
    ) {
      branches.push(readBranch(node.whenTrue));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return branches;
}

/** Invites the reader to create the thing that is missing, which here is a class. */
const INVITES = /\b(create|add)\b/i;

/**
 * One verdict per PAGE, with the empty states of everything the page renders.
 */
function analyse(pages, matrix) {
  const results = [];

  for (const page of pages) {
    const sf = parse(page);
    const permission = pagePermission(sf);
    const reaching = permission ? Object.keys(matrix).filter((role) => can(matrix, role, permission)) : [];
    const blocked = reaching.filter((role) => !can(matrix, role, 'class:write'));

    const closure = renderClosure(page);
    const invitations = [];
    let sawEmptyState = false;
    let sawShared = false;

    for (const module of closure) {
      let moduleSource;
      try {
        moduleSource = parse(module);
      } catch {
        continue;
      }
      for (const branch of noClassesBranches(moduleSource)) {
        sawEmptyState = true;
        if (branch.usesShared) sawShared = true;
        if (INVITES.test(branch.text)) {
          invitations.push({ file: module, text: branch.text });
        }
      }
    }

    if (!sawEmptyState) {
      results.push({ file: page, permission, verdict: 'no-empty-state', roles: reaching });
      continue;
    }

    if (!invitations.length) {
      results.push({
        file: page,
        permission,
        verdict: sawShared ? 'shared-role-aware' : 'own-copy-no-invitation',
        roles: reaching,
      });
      continue;
    }

    if (blocked.length) {
      results.push({
        file: page,
        permission,
        verdict: 'FAIL',
        roles: reaching,
        blocked,
        invitations,
      });
      continue;
    }

    results.push({
      file: page,
      permission,
      verdict: 'invitation-allowed-for-every-reachable-role',
      roles: reaching,
      invitations,
    });
  }

  return results;
}

// ---------------------------------------------------------------- self-test

/**
 * A gate with no fixture cannot be shown to fail. The fixture below is a
 * miniature of the real defect: a page a student can reach, whose empty state
 * tells them to create a class.
 */
function selfTest() {
  const matrix = {
    instructor: { 'history:read': 'yes', 'class:write': 'yes' },
    admin: { 'history:read': 'yes', 'class:write': 'yes' },
    student: { 'history:read': 'own', 'class:write': 'no' },
    guardian: { 'history:read': 'linked', 'class:write': 'no' },
  };

  const cases = [
    {
      name: 'a student-reachable page that tells them to create a class',
      permission: 'history:read',
      body: `if (classes.length === 0) {
        return <p>History follows a student, and no classes exist yet. Create a class and add a roster first.</p>;
      }`,
      expect: 'FAIL',
    },
    {
      name: 'the same page using the shared component',
      permission: 'history:read',
      body: `if (classes.length === 0) {
        return <NoClassesYet role={session.role} subject="History records" />;
      }`,
      expect: 'shared-role-aware',
    },
    {
      name: 'a teacher-only page that invites a class',
      permission: 'attendance:write',
      body: `if (classes.length === 0) {
        return <p>There is no class to take attendance for yet. Create one first.</p>;
      }`,
      expect: 'invitation-allowed-for-every-reachable-role',
    },
    {
      name: 'a page with no empty state at all',
      permission: 'history:read',
      body: `return <div>hello</div>;`,
      expect: 'no-empty-state',
    },
    {
      /*
       * THE CASE THAT WAS MISSED TWICE. Two branches on the same condition,
       * the first harmless and the second the whole defect, and a client
       * component rather than the page itself.
       */
      name: 'a second branch on the same condition, in a rendered component',
      permission: 'history:read',
      body: `const summary = classes.length === 0 ? 'Nothing yet.' : 'Some classes.';
      return <div>{summary}</div>;`,
      component: `export function Manager({ classes }: { classes: unknown[] }) {
  return (
    <div>
      {classes.length === 0 ? (
        <p>Create one and everything else attaches to it.</p>
      ) : null}
    </div>
  );
}`,
      expect: 'FAIL',
    },
  ];

  let ok = true;
  /*
   * The fixture lives under `src/`, because that is where a real component
   * lives and the closure deliberately follows only files under `src`. A
   * fixture in the repository root would be excluded by the same rule that
   * keeps the gate honest, and the case would report a false clean.
   */
  const dir = path.join(ROOT, 'src', '.verify-empty-states-selftest');
  fs.mkdirSync(dir, { recursive: true });

  for (const [index, testCase] of cases.entries()) {
    const page = path.join(dir, `page-${index}.tsx`);
    const component = path.join(dir, `manager-${index}.tsx`);
    const source = `import { Manager } from './manager-${index}';

export default async function Page() {
  const session = await requirePagePermission('${testCase.permission}');
  ${testCase.body}
  return <Manager classes={[]} />;
}
`;
    try {
      fs.writeFileSync(page, source, 'utf8');
      fs.writeFileSync(
        component,
        testCase.component ??
          'export function Manager({ classes }: { classes: unknown[] }) {\n  return <div>{classes.length}</div>;\n}\n',
        'utf8',
      );
      const results = analyse([page], matrix);
      const got = results[0]?.verdict;
      if (got !== testCase.expect) {
        ok = false;
        console.log(`FAIL  ${testCase.name}: expected ${testCase.expect}, got ${got}`);
      }
    } finally {
      /* the directory is removed once, below */
    }
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* leave it; a temp directory is not worth a failed gate */
  }

  if (ok) console.log(`PASS  self-test: ${cases.length} empty-state cases classified as expected`);
  return ok;
}

// -------------------------------------------------------------------- main

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1);
}

if (!fs.existsSync(RBAC)) {
  console.log('FAIL  src/lib/auth/rbac.ts is not there, so the matrix cannot be read.');
  process.exit(1);
}

const matrix = readMatrix();
const roles = Object.keys(matrix);
if (!roles.length) {
  console.log('FAIL  the matrix read as empty. The scan looked at nothing.');
  process.exit(1);
}

function pageFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(p, out);
    else if (entry.name === 'page.tsx') out.push(p);
  }
  return out;
}

const pages = pageFiles(path.join(APP, '(dashboard)'));
const results = analyse(pages, matrix);

console.log(
  `verify:empty-states — ${pages.length} dashboard page(s), ${roles.length} roles in the matrix ` +
    `(${roles.join(', ')})\n`,
);

const counts = {};
const failures = [];
for (const r of results) {
  counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const roleNote = r.roles?.length ? `  reachable by ${r.roles.join(', ')}` : '';
  console.log(`${r.verdict.padEnd(44)} ${rel(r.file)}  (${r.permission ?? 'no permission'})${roleNote}`);
  if (r.verdict === 'FAIL') {
    failures.push(r);
    for (const invitation of r.invitations) {
      console.log(`      copy in ${rel(invitation.file)}: ${invitation.text.slice(0, 200)}`);
    }
    console.log(
      `      ${r.blocked.join(', ')} can reach this page and cannot create a class, so this instruction ` +
        'is one the application will refuse them.',
    );
  }
}

console.log(`\n${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);

if (failures.length) {
  console.log(`\nFAIL  ${failures.length} page(s) tell a reader to create a class their role cannot create:`);
  for (const f of failures) {
    console.log(`  ${rel(f.file)}  (${f.permission}, blocked for ${f.blocked.join(', ')})`);
  }
  console.log(
    '  Render the shared `NoClassesYet` component, whose copy is role-aware, or drop the invitation.',
  );
  process.exit(1);
}

console.log('\nPASS  no page tells a reader to create a class their role cannot create.');
