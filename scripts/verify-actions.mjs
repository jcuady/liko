#!/usr/bin/env node
/**
 * verify:actions — every exported server action is reachable from a UI module.
 *
 * THE OTHER HALF OF verify:controls.
 *
 * `verify:controls` starts at a control and asks whether a handler reaches it.
 * It cannot notice an action that no control ever calls, because from the
 * button's side there is nothing to look at. This starts at the action and asks
 * whether anything imports it.
 *
 * That gap is not theoretical in this repository. Four exported actions were
 * dead when this gate was written: `logoutAction` and `loadPolicies` (removed),
 * and `addAttendanceNote` and `timetableAiStatusAction`, both of which existed
 * since their pages were built and were reachable only by typing their name.
 * All four were found by hand, one at a time, over several rounds. A hand-found
 * defect is a defect that recurs.
 *
 * WHY AN AST AND NOT A NAME COUNT. `createDeck` exists in `flashcards/actions.ts`
 * and `createDeckAction` in `slides/actions.ts`; a substring search cannot tell
 * an import of one from a mention of the other, and a name that happens to
 * appear in a comment reads exactly like a live reference. TypeScript is already
 * a dependency (tsc runs in every gate run), so this resolves real import
 * bindings and local aliases rather than guessing.
 *
 * CATEGORIES, AND WHY THERE ARE FOUR.
 *
 *   wired       imported by another module, or reached transitively through one
 *               that is.
 *   namespace   imported via `import * as ns`, but `ns.name` was not resolved.
 *               A namespace import can be indexed dynamically, so this is
 *               UNEXAMINED, not dead. Reported, never failed -- the same
 *               discipline verify:controls uses for a JSX spread: an
 *               unresolvable reference is not evidence of absence.
 *   unexamined  the name occurs in the tree outside its own module but not in a
 *               form this instrument can attribute to an import. Reported.
 *   dead        no evidence anywhere. The only category that fails.
 *
 * A gate that fails on correct code gets switched off, so the three uncertain
 * categories report and the one certain category fails.
 *
 * REACHABILITY. An action called only by another action in its own file is not
 * dead if the caller is wired, so edges are followed to a fixed point. What is
 * deliberately NOT chased is the further question of whether the importing
 * component itself renders a control. That is `verify:controls`, and composing
 * the two gates is the point: this one proves the action has a consumer,
 * that one proves the consumer is reachable.
 *
 * USAGE
 *   node scripts/verify-actions.mjs
 *   node scripts/verify-actions.mjs --self-test   (plant a dead action, expect red)
 */
import fs from 'node:fs';
import path from 'node:path';
import pathUtil from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const SERVER_DIRECTIVE = 'use server';

const rel = (p) => pathUtil.relative(ROOT, p).split(pathUtil.sep).join('/');

/** Every .ts/.tsx under src, excluding tests and declarations. */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|d)\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * True when the file carries a real `'use server'` directive -- a prologue
 * statement at the top of the file, or the first statement of a function body.
 *
 * The bare substring is NOT enough: `options.ts` in two folders mentions the
 * words inside a comment and was counted as an action module by the first
 * version of this scanner.
 */
function hasServerDirective(sf) {
  const topLevel = sf.statements.slice(0, 3);
  if (topLevel.some(isUseServerString)) return true;
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body) &&
      node.body.statements[0] &&
      isUseServerString(node.body.statements[0])
    ) {
      return true;
    }
    return ts.forEachChild(node, visit) || false;
  };
  return ts.forEachChild(sf, visit) === true;
}

const isUseServerString = (stmt) =>
  ts.isExpressionStatement(stmt) &&
  ts.isStringLiteral(stmt.expression) &&
  stmt.expression.text === SERVER_DIRECTIVE;

/** Exported function-shaped bindings in a module. */
function exportedFunctions(sf) {
  const names = new Set();
  for (const stmt of sf.statements) {
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported) names.add(stmt.name.text);
    if (ts.isVariableStatement(stmt) && isExported) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) {
          if (
            ts.isArrowFunction(d.initializer) ||
            ts.isFunctionExpression(d.initializer) ||
            ts.isCallExpression(d.initializer)
          ) {
            names.add(d.name.text);
          }
        }
      }
    }
  }
  return names;
}

/** Resolve a relative or '@/'-prefixed specifier to a file under src, or null. */
function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * For each module: which named exports are imported from it (under which local
 * alias), and which namespace aliases point at it.
 */
function readImports(files, parsed) {
  const named = new Map(); // targetFile -> Map(importedName -> Set(consumerFile))
  const namespaces = new Map(); // targetFile -> Set(localNsName) -> consumers

  for (const [file, sf] of parsed) {
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      const target = resolveModule(file, spec.text);
      if (!target) continue;

      const clause = stmt.importClause;
      if (!clause) continue;

      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const imported = el.propertyName?.text ?? el.name.text;
          if (!named.has(target)) named.set(target, new Map());
          const byName = named.get(target);
          if (!byName.has(imported)) byName.set(imported, new Set());
          byName.get(imported).add(file);
        }
      }

      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        if (!namespaces.has(target)) namespaces.set(target, new Map());
        const m = namespaces.get(target);
        const ns = clause.namedBindings.name.text;
        if (!m.has(ns)) m.set(ns, new Map());
        if (!m.get(ns).has(file)) m.get(ns).set(file, new Set());
      }
    }
  }

  /*
   * DYNAMIC IMPORTS.
   *
   * `const { loadGrades } = await import('./actions')` is a real import and was
   * invisible to the static pass, because it is a CallExpression, not an
   * ImportDeclaration. Four loaders in this repository are consumed exactly
   * this way -- `loadGrades`, `loadAssessments`, `loadQuestions` and
   * `listDeckAssets` -- and the first version of this gate reported all four
   * as unexamined. They were wired all along; the instrument was the thing
   * that could not see.
   *
   * THE BINDING IS NOT AN ARGUMENT TO THE CALL. `import('./actions')` takes one
   * argument, the specifier. The destructuring belongs to the ASSIGNMENT:
   * `const { loadGrades } = <awaited module>`. An earlier version looked for a
   * second argument to the import call and so found nothing, which is how the
   * first attempt at this branch reported every dynamic import as a bare
   * namespace and failed to distinguish anything.
   *
   * So the shape is read from the binding site: an ObjectBindingPattern names
   * the exports used, a plain Identifier is a namespace alias, and anything
   * else puts the whole module in play and stays unexamined.
   */
  const DYNAMIC_MARKER = '*dynamic*';
  for (const [file, sf] of parsed) {
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const target = resolveModule(file, arg.text);
          if (target) {
            // Unwrap `await import(...)` and any parentheses to reach the
            // binding site.
            let site = node.parent;
            while (
              site &&
              (ts.isAwaitExpression(site) ||
                ts.isParenthesizedExpression(site) ||
                ts.isAsExpression(site))
            ) {
              site = site.parent;
            }

            const imported = [];
            let alias = null;

            if (site && ts.isVariableDeclaration(site) && site.initializer) {
              if (ts.isObjectBindingPattern(site.name)) {
                for (const el of site.name.elements) {
                  imported.push(el.propertyName?.text ?? el.name.text);
                }
              } else if (ts.isIdentifier(site.name)) {
                alias = site.name.text;
              }
            } else if (site && ts.isPropertyAccessExpression(site)) {
              // `import('./x').then(m => m.foo())` -- the module is used whole.
              alias = DYNAMIC_MARKER;
            }

            if (imported.length) {
              for (const name of imported) {
                if (!named.has(target)) named.set(target, new Map());
                const byName = named.get(target);
                if (!byName.has(name)) byName.set(name, new Set());
                byName.get(name).add(file);
              }
            } else {
              const ns = alias ?? DYNAMIC_MARKER;
              if (!namespaces.has(target)) namespaces.set(target, new Map());
              const m = namespaces.get(target);
              if (!m.has(ns)) m.set(ns, new Map());
              if (!m.get(ns).has(file)) m.get(ns).set(file, new Set());
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }

  return { named, namespaces };
}

/** Which `ns.name` property reads actually occur in each consumer file. */
function namespaceReads(files, parsed, namespaces) {
  const reads = new Map(); // `${target}::${ns}::${consumer}` -> Set(prop)
  for (const [target, nsMap] of namespaces) {
    for (const [ns, consumers] of nsMap) {
      // `.keys()`, not the Map itself. Iterating a Map directly yields
      // [key, value] PAIRS, so `parsed.get(consumer)` was undefined for every
      // consumer, the read was skipped, and every namespace import silently
      // reported as unresolved.
      for (const consumer of consumers.keys()) {
        const sf = parsed.get(consumer);
        if (!sf) continue;
        const seen = new Set();
        const visit = (node) => {
          if (
            ts.isPropertyAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === ns
          ) {
            seen.add(node.name.text);
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sf, visit);
        reads.set(`${target}::${ns}::${consumer}`, seen);
      }
    }
  }
  return reads;
}

/**
 * Within a module, which exported action names does each exported action call?
 *
 * TWO BUGS WERE FIXED HERE, AND BOTH WOULD HAVE MADE THE GATE UNABLE TO FAIL.
 *
 * 1. The declaration is not a reference. `export async function deadAction()`
 *    contains the identifier `deadAction`, so scanning every statement for the
 *    name made each action appear to reference itself.
 *
 * 2. The edge must be PER ACTION, not per file. The second version asked "is
 *    `other` referenced anywhere in this module?" and then copied that same set
 *    onto every action. Since `analyse` promotes by fixed point, one imported
 *    export made every sibling in the file `wired` -- and a module of seven
 *    actions with one dead export reported as seven healthy ones. That is not a
 *    false positive to be tuned away; it is the whole gate switched off while
 *    still printing PASS.
 *
 * So each action is located in the syntax tree and only ITS OWN body is scanned.
 */
function intraModuleReferences(sf) {
  const exported = exportedFunctions(sf);

  /** exported name -> the node holding its implementation */
  const nodeOf = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      nodeOf.set(stmt.name.text, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) nodeOf.set(d.name.text, d.initializer);
      }
    }
  }

  const perExported = new Map();
  for (const name of exported) {
    const refs = new Set();
    const node = nodeOf.get(name);
    if (node) {
      // Only the implementation is scanned; the binding name is not a reference.
      const scanRoot = ts.isFunctionDeclaration(node) ? (node.body ?? node) : node;
      const visit = (n) => {
        if (ts.isIdentifier(n) && exported.has(n.text) && n.text !== name) refs.add(n.text);
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(scanRoot, visit);
    }
    perExported.set(name, refs);
  }
  return perExported;
}

/**
 * Identifier nodes that are BINDING positions rather than uses. An identifier
 * in one of these places says the name exists, not that anything calls it.
 */
function bindingNameNodes(sf) {
  const bindings = new Set();
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      bindings.add(node.name);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) bindings.add(node.name);
    if (ts.isImportSpecifier(node)) {
      bindings.add(node.name);
      if (node.propertyName) bindings.add(node.propertyName);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) bindings.add(node.name);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return bindings;
}

/**
 * Does this name occur anywhere in the tree outside its own module, as a USE
 * rather than as a declaration?
 *
 * A same-named export in another module is not a use of this one. Before this
 * distinction existed, two fixture modules that both declared `deadAction`
 * made each other look used, and the dead branch could never be reached.
 */
function mentionsElsewhere(name, declaringFile, parsed) {
  let hits = 0;
  for (const [file, sf] of parsed) {
    if (file === declaringFile) continue;
    const bindings = bindingNameNodes(sf);
    let used = false;
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === name && !bindings.has(node)) {
        // `ns.name` is a read of a namespace member, and it cannot be
        // attributed to one particular module. Counting it as a use of THIS
        // module's export would let an unrelated namespace read mask a dead
        // export, which is the one thing this gate must never do.
        const isPropertyName =
          node.parent &&
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node;
        if (!isPropertyName) used = true;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    if (used) hits += 1;
  }
  return hits;
}

function analyse(files) {
  const parsed = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('.x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }

  const actionModules = new Map();
  for (const [file, sf] of parsed) {
    if (hasServerDirective(sf)) {
      const names = exportedFunctions(sf);
      if (names.size) actionModules.set(file, names);
    }
  }

  const { named, namespaces } = readImports(files, parsed);
  const nsReads = namespaceReads(files, parsed, namespaces);

  const results = [];
  for (const [file, names] of actionModules) {
    const byName = named.get(file);
    const nsMap = namespaces.get(file);
    const intra = intraModuleReferences(parsed.get(file));

    const status = new Map();
    for (const name of names) {
      const direct = byName?.get(name) ? new Set(byName.get(name)) : new Set();

      let nsImported = false;
      let nsResolved = false;
      if (nsMap) {
        for (const [ns, consumers] of nsMap) {
          nsImported = true;
          // `.keys()` again: `consumers` is a Map, so iterating it directly
          // yields [key, value] pairs and every lookup was against a
          // malformed key.
          for (const consumer of consumers.keys()) {
            if (nsReads.get(`${file}::${ns}::${consumer}`)?.has(name)) nsResolved = true;
          }
        }
      }

      const elsewhere = mentionsElsewhere(name, file, parsed);
      if (direct.size) status.set(name, { verdict: 'wired', via: [...direct].map(rel) });
      else if (nsResolved) status.set(name, { verdict: 'wired', via: ['namespace import, property read resolved'] });
      else if (nsImported) status.set(name, { verdict: 'namespace', via: [] });
      else if (elsewhere) status.set(name, { verdict: 'unexamined', via: [`name occurs in ${elsewhere} other module(s)`] });
      else status.set(name, { verdict: 'dead', via: [] });
    }
    results.push({ file, names, status, intra });
  }

  // Fixed point: an action reached by a wired action is wired.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of results) {
      for (const [name, info] of r.status) {
        if (info.verdict !== 'dead' && info.verdict !== 'unexamined') continue;
        const callees = r.intra.get(name) || new Set();
        for (const callee of callees) {
          if (r.status.get(callee)?.verdict === 'wired') {
            info.verdict = 'wired';
            info.via = [`transitive via ${callee}`];
            changed = true;
            break;
          }
        }
      }
    }
  }

  return { results, moduleCount: actionModules.size, fileCount: files.length };
}

// ---------------------------------------------------------------- self-test

/**
 * A gate with no fixture cannot be shown to fail, and a gate that has never
 * failed is indistinguishable from one that cannot see.
 *
 * The first version of this test asserted that an action with no importer is
 * `dead`, while the fixture that contained it also had an `import * as ns` of
 * the same module. It came back `namespace`, which is the CORRECT answer: a
 * namespace import can be indexed dynamically, so nothing in that module can be
 * proven dead. The test was wrong and the gate was right.
 *
 * So the fixture is split in two. Scenario A has no namespace import at all, and
 * is the only thing allowed to claim `dead` -- without it the dead branch would
 * never be exercised and the gate's headline claim would be untested. Scenario B
 * adds the namespace import and asserts the same member is now UNEXAMINED rather
 * than dead, which is the false positive that would get a gate switched off.
 */
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || '.'), 'verify-actions-'));
  const dir = path.join(tmp, 'src');
  fs.mkdirSync(path.join(dir, 'a'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'b'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'c'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'd'), { recursive: true });
  const w = (p, s) => fs.writeFileSync(path.join(dir, p), s);

  const ACTIONS = [
    "'use server';",
    'export async function liveAction() { return 1; }',
    'export async function deadAction() { return 2; }',
    'export async function nsAction() { return 3; }',
    'export async function callerAction() { return liveAction(); }',
    'export async function onlyMentioned() { return 4; }',
    'export async function dynamicAction() { return 5; }',
  ].join('\n');

  // A: named imports only. `onlyMentioned` is referenced without being
  // imported, which is the UNEXAMINED case: present in the tree, attributable
  // to no import binding.
  w('a/actions.ts', ACTIONS);
  w(
    'a/ui.tsx',
    [
      "import { liveAction } from './actions';",
      "import { callerAction } from './actions';",
      'export const mentions = onlyMentioned; // referenced, never imported',
    ].join('\n'),
  );

  // B: same module, plus a namespace import. `nsAction` is read; `deadAction`
  // is not readable, so it must fall back to unexamined rather than dead.
  w('b/actions.ts', ACTIONS);
  w(
    'b/ui.tsx',
    [
      "import * as everything from './actions';",
      'export function Panel() { return everything.nsAction(); }',
    ].join('\n'),
  );

  // C: dynamic import WITH a destructuring pattern. This is how the four
  // loaders in the real repository are actually consumed, and the static pass
  // could not see it.
  w('c/actions.ts', ACTIONS);
  w(
    'c/ui.tsx',
    [
      "export async function Panel() {",
      "  const { dynamicAction } = await import('./actions');",
      '  return dynamicAction();',
      '}',
    ].join('\n'),
  );

  // D: dynamic import with NO binding pattern puts the whole module in play,
  // so nothing in it can be proven dead.
  w('d/actions.ts', ACTIONS);
  w(
    'd/ui.tsx',
    [
      "export async function Panel() {",
      "  const mod = await import('./actions');",
      '  return mod.dynamicAction();',
      '}',
    ].join('\n'),
  );

  const files = sourceFiles(dir);
  const { results } = analyse(files);
  const grab = (suffix) => {
    const t = results.find((r) => rel(r.file).endsWith(suffix));
    if (!t) return null;
    return Object.fromEntries([...t.status.entries()].map(([k, v]) => [k, v.verdict]));
  };

  let ok = true;
  const check = (scenario, got, expected) => {
    for (const [name, want] of Object.entries(expected)) {
      if (got?.[name] !== want) {
        ok = false;
        console.log(`FAIL  ${scenario} ${name}: expected ${want}, got ${got?.[name] ?? '(absent)'}`);
      }
    }
  };

  check('A', grab('a/actions.ts'), {
    liveAction: 'wired',
    callerAction: 'wired',
    onlyMentioned: 'unexamined',
    deadAction: 'dead',
    nsAction: 'dead',
  });

  check('B', grab('b/actions.ts'), {
    nsAction: 'wired',
    liveAction: 'namespace',
    callerAction: 'namespace',
    deadAction: 'namespace',
    onlyMentioned: 'namespace',
  });

  check('C', grab('c/actions.ts'), {
    dynamicAction: 'wired',
    deadAction: 'dead',
  });

  check('D', grab('d/actions.ts'), {
    dynamicAction: 'wired',
    deadAction: 'namespace',
  });

  // The claim the gate makes in its PASS line, asserted rather than assumed.
  if (ok) {
    console.log(
      'PASS  self-test: A proves dead is reachable; B proves a namespace import is never read as dead; ' +
        'C and D prove dynamic imports resolve',
    );
  }

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* leave it; a temp dir is not worth a failed gate */
  }
  return ok;
}

// -------------------------------------------------------------------- main

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1);
}

const files = sourceFiles(SRC);
const { results, moduleCount, fileCount } = analyse(files);

console.log(`verify:actions — ${fileCount} source files scanned, ${moduleCount} server-action modules\n`);

if (moduleCount === 0) {
  console.log('FAIL  no server-action modules found. The scan looked at nothing.');
  process.exit(1);
}

const counts = { wired: 0, namespace: 0, unexamined: 0, dead: 0 };
const dead = [];
const flagged = [];

for (const r of results.sort((a, b) => rel(a.file).localeCompare(rel(b.file)))) {
  const rows = [...r.status.entries()];
  console.log(`${rel(r.file)}  (${rows.length})`);
  for (const [name, info] of rows) {
    counts[info.verdict] = (counts[info.verdict] ?? 0) + 1;
    const suffix = info.via.length ? `  <- ${info.via.join(', ')}` : '';
    console.log(`  ${info.verdict.padEnd(10)} ${name}${suffix}`);
    if (info.verdict === 'dead') dead.push({ file: rel(r.file), name });
    if (info.verdict === 'namespace' || info.verdict === 'unexamined') flagged.push({ file: rel(r.file), name, verdict: info.verdict });
  }
  console.log('');
}

console.log(
  `${counts.wired} wired, ${counts.namespace} namespace-unresolved, ${counts.unexamined} unexamined, ${counts.dead} dead`,
);

if (flagged.length) {
  console.log(`\nUnexamined, reported and NOT failed:`);
  for (const f of flagged) console.log(`  ${f.verdict.padEnd(10)} ${f.name}  (${f.file})`);
}

if (dead.length) {
  console.log(`\nFAIL  ${dead.length} exported server action(s) that nothing imports:`);
  for (const d of dead) console.log(`  ${d.name}  (${d.file})`);
  console.log('  An exported action with no consumer is unreachable. Wire it, or delete it.');
  process.exit(1);
}

console.log('\nPASS  every exported server action is reachable from a module that imports it.');
