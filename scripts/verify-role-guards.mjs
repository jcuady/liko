#!/usr/bin/env node
/**
 * verify:role-guards — a page must not offer a control its reader cannot use.
 *
 * THE DEFECT THIS EXISTS TO CATCH.
 *
 * Four times now a page has been found offering a control to a role that the
 * server would refuse. `/classes` offered "New class" to every student and
 * every guardian, on the page that is their landing page. `/history` offered a
 * free-text behaviour-note field, with a severity picker that said "praise"
 * and "concern", to a student and a guardian. `/grades` handed a student and a
 * guardian an editable cell for every mark, a button that decides the scale a
 * whole class is reported on, a dialog to invent a scale, and a button to
 * create an assessment. `/flashcards` offered a guardian a "New deck" button
 * whose class picker was empty.
 *
 * In every one of the four the SERVER was already correct. The action called
 * `requirePermission`, the permission said `no` for the role, the server
 * refused, and the refusal arrived as a toast reading like a broken product. A
 * control that always refuses is worse than no control, because the refusal
 * reads as a defect in the application rather than as a boundary.
 *
 * AND THE AUDIT SAID THIS COULD NOT BE CHECKED.
 *
 * `docs/SYSTEM_AUDIT.md` closed round nineteen with the claim that "a gate
 * that reads source cannot tell a control that is role-gated from one that is
 * not". That claim was never tested. It is the reason this file exists: the
 * claim is wrong, and the way to show that it is wrong is to build the gate and
 * run it against the real tree. A document that describes what the code
 * enforces is a claim about the code, and it has to be checked against the
 * code.
 *
 * WHY THE MATRIX IS READ FROM THE SOURCE AND NOT COPIED.
 *
 * The rule is a property of two things at once: the controls on the page, and
 * the roles that can reach the page. Both live in the repository, and
 * `rbac.ts` says of itself: "Both must consult this file, never a local
 * copy." So this reads `MATRIX` out of `src/lib/auth/rbac.ts` with the
 * TypeScript compiler and implements `can()` exactly as the application does:
 * a scope of `no` is refused, and an ownership scope counts as permitted.
 *
 * WHY THE PERMISSION COMES FROM THE ACTION AND NOT FROM A LIST.
 *
 * The gate must not carry a second opinion about which permission a write
 * needs, because a second opinion is a third copy and it would drift. So the
 * permission is read out of `requirePermission('...')` in the server action
 * itself, which is the one place the rule is written down.
 *
 * WHAT THE GATE PROVES.
 *
 * For every dashboard page, for every role that can reach it, for every
 * permission that a write on that page needs and that role does not hold:
 * every control that performs that write must sit behind a guard that forces
 * the permission. A guard forces a permission when the code cannot render the
 * control unless the role holds it.
 *
 * The mechanisms that make a guard force a permission are all read from the
 * source, and each is listed in the HOUSE RULES below. Nothing here is a
 * second opinion: `can()` is the application's own function, the permission is
 * the action's own, and the render path is the component's own.
 *
 * HOUSE RULES. These are the ways this codebase writes a guard, and the gate
 * reads each one. A guard written some other way will not be understood, and
 * the gate will report the control as unguarded rather than pass a guard it
 * did not read.
 *
 *  1. `can(role, 'x:y')` forces `x:y`. This is the application's own function.
 *  2. A conjunction forces every permission its parts force, so
 *     `mayWrite && (ownsIt || isDemo)` forces `mayWrite`'s permission.
 *  3. A conditional's true branch is forced by its test; its false branch is
 *     forced by nothing, because the false branch is where the readers are.
 *  4. A guard clause (`if (cond) return;`) forces the permissions that
 *     `cond` being FALSE forces, which is the same set `cond` being true
 *     forces when `cond` is a negation.
 *  5. A React state variable is truthy only if some truthy assignment to it
 *     was reachable, so it forces every permission that all of its truthy
 *     assignments are forced by.
 *  6. A prop forces whatever the render site passed it, and a property of an
 *     object prop forces whatever the object literal it came from holds.
 *  7. A `<Dialog open={E}>` renders its content only while it is open, so
 *     everything under it forces `E`. This is the house's own wrapper around
 *     Radix, and the rule is checked against `src/components/ui/dialog.tsx`.
 *  8. A function handed to a child as a prop runs wherever the child calls
 *     it, so the child's call site decides what forces it.
 *
 * WHAT IT DOES NOT COVER, STATED PLAINLY.
 *
 * This is a static reading of a React tree. It reads the permissions, the
 * guards and the render path. It does not run the application, so it cannot
 * follow a permission that depends on a value it cannot trace, and where it
 * cannot trace one it reports the control as unguarded rather than passing a
 * guard it did not read.
 *
 * The browser check in `e2e/role-controls.spec.ts` and in
 * `scripts/verify-app-live.mjs` remains the instrument that observes the
 * running product. This gate is the one that finds the NEXT page with the
 * defect, because it does not need anybody to read the page.
 *
 * USAGE
 *   node scripts/verify-role-guards.mjs
 *   node scripts/verify-role-guards.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/*
 * THE ROOT IS THE REPOSITORY, NOT THE WORKING DIRECTORY.
 *
 * `process.cwd()` is wherever the caller happened to be, and a gate that reads
 * a different tree depending on who ran it is a gate whose result depends on
 * the shell. This resolves the repository from the script's own path, so
 * `node scripts/verify-role-guards.mjs` reads the same tree from anywhere.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'src', 'app');
const SRC = path.join(ROOT, 'src');
const RBAC = path.join(ROOT, 'src', 'lib', 'auth', 'rbac.ts');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const MAX_DEPTH = 14;
const MAX_NODES = 4000;

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ES2022,
    true,
    /*
     * The script kind follows the extension, and the test is `'.tsx'`, NOT
     * `'.x'`. `'foo.tsx'.endsWith('.x')` is false, because the last two
     * characters are `sx`. A `.tsx` file parsed as plain TypeScript cannot
     * parse JSX at all, so every tag name came back empty and the gate would
     * report clean files that were full of controls.
     */
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// ---------------------------------------------------------------- the matrix

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

// -------------------------------------------------------------- set helpers

const unionOf = (...sets) => {
  const out = new Set();
  for (const set of sets) for (const value of set) out.add(value);
  return out;
};

const intersectOf = (a, b) => {
  const out = new Set();
  for (const value of a) if (b.has(value)) out.add(value);
  return out;
};

// --------------------------------------------------------- module plumbing

function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      /*
       * Only files under `src` are followed. The gate never walks into a
       * dependency and never walks out of the tree it is auditing, and the
       * same rule that keeps it honest also keeps the fixture directory in the
       * self-test inside the tree.
       */
      if (!candidate.startsWith(SRC)) return null;
      return candidate;
    }
  }
  return null;
}

/** Local name -> { file, exportName }. Type-only imports are not renderings. */
function importMap(sf, file) {
  const map = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const target = resolveModule(file, stmt.moduleSpecifier.text);
    if (!target) continue;
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const spec of bindings.elements) {
        if (spec.isTypeOnly) continue;
        map.set(spec.name.text, {
          file: target,
          exportName: spec.propertyName?.text ?? spec.name.text,
        });
      }
    } else if (clause.name) {
      map.set(clause.name.text, { file: target, exportName: 'default' });
    }
  }
  return map;
}

/** Every local file a file imports, directly. */
function localImports(sf, file) {
  const out = new Set();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const target = resolveModule(file, stmt.moduleSpecifier.text);
    if (target) out.add(target);
  }
  return out;
}

// ----------------------------------------------------------- file bindings

function collectBindings(sf) {
  const decls = new Map();
  const locals = new Set();
  const params = new Set();
  const functions = new Set();
  const stateSetters = new Map();

  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      /*
       * `const [value, setValue] = React.useState(null)` has an ARRAY binding
       * pattern, not an identifier, so a scan that only looks at identifiers
       * never learns that `value` is a state variable or what its setter is
       * called. Every state rule in this file depends on that pair.
       */
      if (ts.isArrayBindingPattern(node.name)) {
        const [value, setter] = node.name.elements;
        if (value && ts.isIdentifier(value.name) && setter && ts.isIdentifier(setter.name)) {
          stateSetters.set(value.name.text, setter.name.text);
          locals.add(value.name.text);
          locals.add(setter.name.text);
        }
      }
      if (ts.isIdentifier(node.name)) {
        decls.set(node.name.text, node);
        locals.add(node.name.text);
        const init = node.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          functions.add(node.name.text);
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      locals.add(node.name.text);
      functions.add(node.name.text);
    }
    if (ts.isParameter(node)) {
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) {
            params.add(element.name.text);
            locals.add(element.name.text);
          }
        }
      } else if (ts.isIdentifier(node.name)) {
        params.add(node.name.text);
        locals.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return { decls, locals, params, functions, stateSetters };
}

// ------------------------------------------------------------ server actions

function isServerActionModule(sf) {
  const first = sf.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const text = first.expression.getText(sf);
  return text === "'use server'" || text === '"use server"';
}

/** The permission a server action demands, read out of its own call. */
function findRequirePermission(node) {
  let found = null;
  const visit = (child) => {
    if (found) return;
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === 'requirePermission'
    ) {
      const arg = child.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        found = arg.text;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  if (node) ts.forEachChild(node, visit);
  return found;
}

/** Exported name -> required permission, for a `'use server'` module. */
function actionPermissions(sf) {
  const out = new Map();
  if (!isServerActionModule(sf)) return out;
  for (const stmt of sf.statements) {
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const permission = findRequirePermission(stmt.body);
      if (permission) out.set(stmt.name.text, permission);
    } else if (ts.isVariableStatement(stmt)) {
      for (const declaration of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const permission = findRequirePermission(declaration.initializer);
        if (permission) out.set(declaration.name.text, permission);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------- the session

/**
 * One session per page analysis.
 *
 * The context of a file is cached here, because the same file is reached
 * through many paths in a render tree and its guards must not be re-derived
 * differently on each path.
 */
function createSession(matrix) {
  return {
    matrix,
    ctxs: new Map(),
    actionPerms: new Map(),
    closureHasAction: new Map(),
    nodesByFile: new Map(),
    nodes: 0,
  };
}

function ctxFor(session, file) {
  const cached = session.ctxs.get(file);
  if (cached) return cached;
  const sf = parse(file);
  const ctx = {
    session,
    file,
    sf,
    imports: importMap(sf, file),
    ...collectBindings(sf),
    guardMemo: new Map(),
    inProgress: new Set(),
  };
  session.ctxs.set(file, ctx);
  return ctx;
}

function actionPermsOf(session, file) {
  const cached = session.actionPerms.get(file);
  if (cached) return cached;
  const perms = actionPermissions(parse(file));
  session.actionPerms.set(file, perms);
  return perms;
}

/** The server actions this file imports, with the permission each demands. */
function importedActions(ctx) {
  const out = new Map();
  for (const [local, binding] of ctx.imports) {
    const perms = actionPermsOf(ctx.session, binding.file);
    const permission = perms.get(binding.exportName);
    if (permission) out.set(local, { file: binding.file, permission });
  }
  return out;
}

/** Whether a file's import closure reaches a server action at all. */
function closureHasAction(session, file, seen = new Set(), depth = 0) {
  if (seen.has(file)) return false;
  seen.add(file);
  if (depth > 8) return false;
  const cached = session.closureHasAction.get(file);
  if (cached !== undefined) return cached;
  const sf = parse(file);
  if (isServerActionModule(sf)) {
    session.closureHasAction.set(file, true);
    return true;
  }
  let found = false;
  for (const imported of localImports(sf, file)) {
    if (closureHasAction(session, imported, seen, depth + 1)) {
      found = true;
      break;
    }
  }
  session.closureHasAction.set(file, found);
  return found;
}

// ----------------------------------------------------------- the render tree

function jsxAttributeExpression(opening, name) {
  for (const prop of opening.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    if (prop.name.text !== name) continue;
    if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) continue;
    return prop.initializer.expression ?? null;
  }
  return null;
}

/** The components a file renders, and the props it hands them. */
function renderSites(ctx) {
  const sites = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = node.openingElement ?? node;
      const tag = opening.tagName;
      if (tag && ts.isIdentifier(tag)) {
        const binding = ctx.imports.get(tag.text);
        if (binding) {
          const attrs = new Map();
          for (const prop of opening.attributes.properties) {
            if (!ts.isJsxAttribute(prop)) continue;
            if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) continue;
            const expression = prop.initializer.expression;
            if (!expression) continue;
            if (!attrs.has(prop.name.text)) attrs.set(prop.name.text, []);
            attrs.get(prop.name.text).push({ file: ctx.file, expr: expression });
          }
          sites.push({ file: binding.file, node, tag: tag.text, attrs });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(ctx.sf, visit);
  return sites;
}

/**
 * Whether a render site is worth walking into.
 *
 * A subtree with no server action in it cannot trigger a write, so walking it
 * costs time and finds nothing. The exception is a component that is handed a
 * FUNCTION, because the function belongs to the parent and the write happens
 * in the parent's code. The gradebook grid is exactly this: it holds no
 * action of its own and is where the parent's `onEdit` is called.
 */
function worthWalking(session, ctx, site) {
  if (closureHasAction(session, site.file)) return true;
  for (const [, values] of site.attrs) {
    for (const value of values) {
      if (ts.isIdentifier(value.expr) && ctx.functions.has(value.expr.text)) return true;
    }
  }
  return false;
}

function buildTree(session, pageFile) {
  const root = {
    file: pageFile,
    depth: 0,
    attrs: new Map(),
    children: [],
    site: null,
    forced: new Set(),
  };
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (node.depth >= MAX_DEPTH) continue;
    if (session.nodes > MAX_NODES) break;
    const ctx = ctxFor(session, node.file);
    for (const site of renderSites(ctx)) {
      if (!worthWalking(session, ctx, site)) continue;
      session.nodes += 1;
      const child = {
        file: site.file,
        depth: node.depth + 1,
        attrs: site.attrs,
        children: [],
        site,
        forced: new Set(),
        parent: node,
      };
      node.children.push(child);
      const list = session.nodesByFile.get(site.file) ?? [];
      list.push(child);
      session.nodesByFile.set(site.file, list);
      queue.push(child);
    }
  }
  return root;
}

// ------------------------------------------------------ permission analysis

function unwrap(expression) {
  let node = expression;
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

/**
 * The values a component was handed, by prop name.
 *
 * A component can be handed a prop by a file that imports it, or by a file it
 * shares a line with: `RosterPanel` lives in `ClassesManager.tsx` and gets
 * `classRecord` from it. Both are render sites, so both are read here. Missing
 * the second one loses the guard that the prop carries, and a lost guard is
 * reported as an unguarded control, which is the wrong answer rather than a
 * safe one.
 */
function propRenderValues(session, ctx, propName) {
  const out = [];
  for (const node of session.nodesByFile.get(ctx.file) ?? []) {
    const values = node.attrs.get(propName);
    if (values) out.push(...values);
  }
  for (const [, attrs] of localPathsOf(ctx).renderAttrs) {
    const values = attrs.get(propName);
    if (values) out.push(...values);
  }
  return out;
}

/**
 * What an expression being TRUE forces.
 *
 * The answer is a set of permissions: every one of them must be held by any
 * role for which the expression can be true.
 */
function impliedTrue(expression, ctx, depth = 0) {
  const session = ctx.session;
  if (!expression || depth > 16) return new Set();
  const node = unwrap(expression);

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'can') {
    const argument = node.arguments[1];
    if (argument && ts.isStringLiteral(argument)) return new Set([argument.text]);
    return new Set();
  }
  if (ts.isIdentifier(node)) return guardOf(node.text, ctx);
  if (ts.isPropertyAccessExpression(node)) {
    const value = propertyValue(session, ctx, node.expression, node.name.text);
    if (!value) return new Set();
    return impliedTrue(value.expr, ctxFor(session, value.file), depth + 1);
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return unionOf(
        impliedTrue(node.left, ctx, depth + 1),
        impliedTrue(node.right, ctx, depth + 1),
      );
    }
    if (
      operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      const right = node.right;
      if (
        right &&
        (right.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(right) && right.text === 'undefined'))
      ) {
        return impliedTrue(node.left, ctx, depth + 1);
      }
      return new Set();
    }
    return new Set();
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return new Set();
  }
  if (ts.isConditionalExpression(node)) return impliedTrue(node.condition, ctx, depth + 1);
  return new Set();
}

/** What an expression being FALSE forces. */
function impliedFalse(expression, ctx, depth = 0) {
  const node = unwrap(expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return impliedTrue(node.operand, ctx, depth + 1);
  }
  return new Set();
}

/** The permissions a name carries when it is true. */
function guardOf(name, ctx) {
  if (ctx.guardMemo.has(name)) return ctx.guardMemo.get(name);
  if (ctx.inProgress.has(name)) return new Set();
  ctx.inProgress.add(name);

  let result = new Set();
  const declaration = ctx.decls.get(name);
  if (declaration && declaration.initializer) {
    result = impliedTrue(declaration.initializer, ctx);
  } else if (ctx.stateSetters.has(name)) {
    result = stateGuardOf(name, ctx);
  } else {
    const values = propRenderValues(ctx.session, ctx, name);
    for (const value of values) {
      const set = impliedTrue(value.expr, ctxFor(ctx.session, value.file));
      if (set.size) {
        result = set;
        break;
      }
    }
  }

  ctx.inProgress.delete(name);
  ctx.guardMemo.set(name, result);
  return result;
}

/**
 * HOUSE RULE 5. A React state variable is truthy only if some truthy
 * assignment to it was reachable, so it forces every permission that ALL of
 * its truthy assignments are forced by.
 */
function stateGuardOf(name, ctx) {
  const setter = ctx.stateSetters.get(name);
  if (!setter) return new Set();
  let accumulated = null;
  for (const site of callSitesOf(ctx, setter)) {
    if (!isTruthyArgument(site)) continue;
    const forced = conditionsAt(site.node, ctx);
    accumulated = accumulated === null ? forced : intersectOf(accumulated, forced);
  }
  return accumulated ?? new Set();
}

function isTruthyArgument(site) {
  const argument = site.argument;
  if (!argument) return false;
  const node = unwrap(argument);
  if (node.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isIdentifier(node) && node.text === 'undefined') return false;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return true;
}

/** Every call of a name in a file, with its first argument. */
function callSitesOf(ctx, name) {
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === name) {
        out.push({ node, argument: node.arguments[0] ?? null });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(ctx.sf, visit);
  return out;
}

/** The local function a node sits inside, if any. */
function enclosingLocalFunction(node, ctx) {
  let current = node.parent;
  while (current) {
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      const name = current.parent.name.text;
      if (ctx.functions.has(name)) return name;
    }
    if (ts.isFunctionDeclaration(current) && current.name) {
      const name = current.name.text;
      if (ctx.functions.has(name)) return name;
    }
    current = current.parent;
  }
  return null;
}

/**
 * The component a node belongs to: the OUTERMOST function it sits inside.
 *
 * A control in a handler inside a component belongs to that component, not to
 * the handler, because the component is what the parent renders and the
 * component is what the parent's conditions reach.
 */
function outermostFunctionName(node) {
  let current = node.parent;
  let name = null;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      name = current.name.text;
    } else if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      name = current.parent.name.text;
    }
    current = current.parent;
  }
  return name;
}

/**
 * HOUSE RULE 9. A component written in the same file as its parent is still
 * rendered by it, and the parent's conditions reach it.
 *
 * The terms form is a component of `CalendarExtrasPanel`, rendered inside
 * `{canWriteTerms ? ... }`, and the conditions that decide whether the term
 * form can be seen are in the parent's body and not in the form's. So the
 * conditions on the path to a local component have to be read, and they have
 * to be INTERSECTED over the places the component is rendered, because the
 * control is offered if ANY of those places leaves it unguarded.
 */
function localComponentPaths(ctx) {
  const renderSites = new Map();
  const renderAttrs = new Map();
  const callSites = new Map();

  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = node.openingElement ?? node;
      const tag = opening.tagName;
      if (tag && ts.isIdentifier(tag) && ctx.functions.has(tag.text)) {
        const list = renderSites.get(tag.text) ?? [];
        list.push(node);
        renderSites.set(tag.text, list);

        const attrs = new Map();
        for (const prop of opening.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue;
          if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) continue;
          const expression = prop.initializer.expression;
          if (!expression) continue;
          if (!attrs.has(prop.name.text)) attrs.set(prop.name.text, []);
          attrs.get(prop.name.text).push({ file: ctx.file, expr: expression });
        }
        renderAttrs.set(tag.text, attrs);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (ctx.functions.has(name)) {
        const list = callSites.get(name) ?? [];
        list.push(node);
        callSites.set(name, list);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(ctx.sf, visit);

  const memo = new Map();

  const forcedOf = (name, stack) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return new Set();
    stack.add(name);

    const paths = [...(renderSites.get(name) ?? []), ...(callSites.get(name) ?? [])];
    let accumulated = null;
    for (const path of paths) {
      const container = outermostFunctionName(path);
      const outer = container && container !== name ? forcedOf(container, stack) : new Set();
      const set = unionOf(conditionsAt(path, ctx), outer);
      accumulated = accumulated === null ? set : intersectOf(accumulated, set);
    }

    stack.delete(name);
    const result = accumulated ?? new Set();
    memo.set(name, result);
    return result;
  };

  return { forcedOf, renderSites, renderAttrs, callSites };
}

/** The local component paths of a file, computed once. */
function localPathsOf(ctx) {
  if (!ctx.localPaths) ctx.localPaths = localComponentPaths(ctx);
  return ctx.localPaths;
}

/**
 * HOUSE RULE 4. A guard clause (`if (cond) return;`) forces everything that
 * `cond` being FALSE forces, for the statements after it in the same block.
 */
function guardClauseCondition(statement) {
  if (!ts.isIfStatement(statement)) return null;
  const exits = (node) => {
    if (
      ts.isReturnStatement(node) ||
      ts.isThrowStatement(node) ||
      ts.isContinueStatement(node) ||
      ts.isBreakStatement(node)
    ) {
      return true;
    }
    if (ts.isBlock(node)) return node.statements.length === 1 && exits(node.statements[0]);
    return false;
  };
  return exits(statement.thenStatement) ? statement.expression : null;
}

/**
 * The permissions forced at a node, by the conditions around it.
 *
 * HOUSE RULE 3 (a conditional's true branch is forced by its test),
 * HOUSE RULE 4 (a guard clause), HOUSE RULE 7 (a `<Dialog open>` renders its
 * content only while it is open).
 */
function conditionsAt(node, ctx) {
  const forced = new Set();
  let current = node;
  let guard = 0;
  while (current && guard < 600) {
    guard += 1;
    const parent = current.parent;
    if (!parent) break;

    if (ts.isConditionalExpression(parent)) {
      if (parent.whenTrue === current) {
        for (const permission of impliedTrue(parent.condition, ctx)) forced.add(permission);
      }
    } else if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      if (parent.right === current) {
        for (const permission of impliedTrue(parent.left, ctx)) forced.add(permission);
      }
    } else if (ts.isIfStatement(parent)) {
      if (parent.thenStatement === current) {
        for (const permission of impliedTrue(parent.expression, ctx)) forced.add(permission);
      }
    } else if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) {
      const opening = parent.openingElement ?? parent;
      const tag = opening.tagName;
      if (tag && ts.isIdentifier(tag) && tag.text === 'Dialog') {
        const open = jsxAttributeExpression(opening, 'open');
        if (open) {
          for (const permission of impliedTrue(open, ctx)) forced.add(permission);
        }
      }
    } else if (ts.isBlock(parent)) {
      const index = parent.statements.indexOf(current);
      if (index > 0) {
        for (let i = 0; i < index; i += 1) {
          const condition = guardClauseCondition(parent.statements[i]);
          if (!condition) continue;
          for (const permission of impliedFalse(condition, ctx)) forced.add(permission);
        }
      }
    }

    current = parent;
  }
  return forced;
}

// ------------------------------------------------------------ value origins

/**
 * HOUSE RULE 6. The value behind a property, followed back to the object
 * literal it was built from.
 *
 * The chain in the classes page is real: `RosterPanel` is handed
 * `classRecord={selected}`, `selected` comes out of `classes`, `classes` is
 * the page's `summaries`, and `summaries` is a `map` that writes
 * `mayManage: mayWrite && (...)`. Each hop is one of these.
 */
function resolveValue(session, ctx, expression, depth = 0) {
  if (!expression || depth > 12) return null;
  const node = unwrap(expression);

  if (ts.isObjectLiteralExpression(node)) {
    return { file: ctx.file, expr: node, kind: 'object' };
  }
  if (ts.isArrayLiteralExpression(node)) {
    return {
      file: ctx.file,
      expr: node,
      kind: 'array',
      element: node.elements.length ? { file: ctx.file, expr: node.elements[0] } : null,
    };
  }
  if (ts.isIdentifier(node)) {
    const declaration = ctx.decls.get(node.text);
    if (declaration && declaration.initializer) {
      return resolveValue(session, ctx, declaration.initializer, depth + 1);
    }
    if (ctx.params.has(node.text) && !ctx.decls.has(node.text)) {
      const values = propRenderValues(session, ctx, node.text);
      for (const value of values) {
        const resolved = resolveValue(
          session,
          ctxFor(session, value.file),
          value.expr,
          depth + 1,
        );
        if (resolved) return resolved;
      }
    }
    return null;
  }
  if (ts.isConditionalExpression(node)) {
    return (
      resolveValue(session, ctx, node.whenTrue, depth + 1) ??
      resolveValue(session, ctx, node.whenFalse, depth + 1)
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return (
      resolveValue(session, ctx, node.left, depth + 1) ??
      resolveValue(session, ctx, node.right, depth + 1)
    );
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    if (method === 'map') {
      const body = callbackBody(node.arguments[0]);
      if (body) {
        return {
          file: ctx.file,
          expr: node,
          kind: 'array',
          element: { file: ctx.file, expr: body },
        };
      }
      return null;
    }
    if (method === 'find' || method === 'filter' || method === 'at') {
      return resolveValue(session, ctx, node.expression.expression, depth + 1);
    }
    return null;
  }
  if (ts.isElementAccessExpression(node)) {
    return resolveValue(session, ctx, node.expression, depth + 1);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return resolveValue(session, ctx, node.expression, depth + 1);
  }
  return null;
}

function callbackBody(callback) {
  if (!callback) return null;
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null;
  const body = callback.body;
  if (ts.isBlock(body)) {
    if (body.statements.length === 1 && ts.isReturnStatement(body.statements[0])) {
      return body.statements[0].expression ?? null;
    }
    return null;
  }
  return body;
}

/** The initializer of `property` on the object a base expression names. */
function propertyValue(session, ctx, baseExpression, property) {
  const base = unwrap(baseExpression);

  if (ts.isIdentifier(base) && ctx.params.has(base.text) && !ctx.decls.has(base.text)) {
    const values = propRenderValues(session, ctx, base.text);
    for (const value of values) {
      const found = propertyValue(
        session,
        ctxFor(session, value.file),
        value.expr,
        property,
      );
      if (found) return found;
    }
    return null;
  }

  const resolved = resolveValue(session, ctx, base);
  if (!resolved) return null;

  if (resolved.kind === 'object' && ts.isObjectLiteralExpression(resolved.expr)) {
    for (const assignment of resolved.expr.properties) {
      if (!ts.isPropertyAssignment(assignment)) continue;
      const name = assignment.name.getText(resolved.expr.getSourceFile()).replace(/['"]/g, '');
      if (name !== property) continue;
      return { file: resolved.file, expr: assignment.initializer };
    }
    return null;
  }
  if (resolved.kind === 'array' && resolved.element) {
    return propertyValue(
      session,
      ctxFor(session, resolved.element.file),
      resolved.element.expr,
      property,
    );
  }
  return null;
}

// ----------------------------------------------------------- trigger finding

/**
 * The write controls on a page, and the permission each one needs.
 *
 * Three shapes exist in this codebase: a direct call of the action, a call
 * through `useMutation`, and a call of a function the parent handed over.
 */
function findTriggers(ctx) {
  const actions = importedActions(ctx);
  const triggers = [];

  /*
   * The mutations first, because a call inside a `mutationFn` is not a
   * control: the control is the `mutate` call, and the `mutationFn` body runs
   * when that call happens. Counting both would report the same write twice,
   * once of them at the top of the component where nothing guards it.
   */
  const mutations = [];
  const mutationVisit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const initializer = node.initializer;
      const callee = initializer.expression;
      const name = ts.isIdentifier(callee) ? callee.text : null;
      if (name === 'useMutation' || name === 'React.useMutation') {
        const target = mutationTarget(initializer, actions);
        if (target) {
          mutations.push({
            variable: node.name.text,
            scope: outermostFunctionName(node),
            mutationFn: target.mutationFn,
            action: target.action,
            permission: target.permission,
          });
        }
      }
    }
    ts.forEachChild(node, mutationVisit);
  };
  ts.forEachChild(ctx.sf, mutationVisit);

  const insideAMutationFn = (node) => {
    let current = node.parent;
    while (current) {
      for (const mutation of mutations) {
        if (mutation.mutationFn && current === mutation.mutationFn) return true;
      }
      current = current.parent;
    }
    return false;
  };

  const callVisit = (node) => {
    if (ts.isCallExpression(node)) {
      /*
       * A mutation call is `m.mutate(...)`. `m` is a name, and names are only
       * unique inside the component that declares them: two components in the
       * same file can both have a `create`. So the match is on the component
       * as well as the name.
       */
      if (ts.isPropertyAccessExpression(node.expression)) {
        const base = node.expression.expression;
        const method = node.expression.name.text;
        if (ts.isIdentifier(base) && (method === 'mutate' || method === 'mutateAsync')) {
          const scope = outermostFunctionName(node);
          const mutation = mutations.find(
            (candidate) =>
              candidate.variable === base.text && candidate.scope === scope,
          );
          if (mutation) {
            triggers.push({
              action: mutation.action,
              permission: mutation.permission,
              node,
              shape: 'mutation',
            });
          }
        }
      }

      if (ts.isIdentifier(node.expression)) {
        const action = actions.get(node.expression.text);
        if (action && !insideAMutationFn(node)) {
          triggers.push({
            action: node.expression.text,
            permission: action.permission,
            node,
            shape: 'direct',
          });
        }
      }
    }
    ts.forEachChild(node, callVisit);
  };
  ts.forEachChild(ctx.sf, callVisit);

  return triggers;
}

/** The action a `useMutation` will run, and the function that runs it. */
function mutationTarget(initializer, actions) {
  const argument = initializer.arguments[0];
  if (!argument) return null;

  let candidate = null;
  if (ts.isObjectLiteralExpression(argument)) {
    for (const assignment of argument.properties) {
      if (!ts.isPropertyAssignment(assignment)) continue;
      const name = assignment.name.getText(argument.getSourceFile()).replace(/['"]/g, '');
      if (name !== 'mutationFn') continue;
      candidate = assignment.initializer;
    }
  } else {
    candidate = argument;
  }
  if (!candidate) return null;

  const node = unwrap(candidate);
  if (ts.isIdentifier(node)) {
    const action = actions.get(node.text);
    if (action) {
      return { action: node.text, permission: action.permission, mutationFn: null };
    }
    return null;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    let found = null;
    const visit = (child) => {
      if (found) return;
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
        const action = actions.get(child.expression.text);
        if (action) {
          found = { action: child.expression.text, permission: action.permission };
          return;
        }
      }
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
    if (!found) return null;
    return { ...found, mutationFn: node };
  }
  return null;
}

/**
 * HOUSE RULE 8. The conditions under which a function handed to a child as a
 * prop actually runs.
 *
 * The child's call site decides, because that is where the function is
 * invoked. The parent's internal call sites decide too, and both sets are
 * unioned, because the function runs if EITHER reaches it.
 */
function propCallForced(ctx) {
  const map = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (ctx.params.has(name) && !ctx.functions.has(name) && !ctx.decls.has(name)) {
        let forced = conditionsAt(node, ctx);
        const enclosing = enclosingLocalFunction(node, ctx);
        if (enclosing) {
          forced = unionOf(forced, internalInvocationForced(ctx, enclosing));
        }
        map.set(name, unionOf(map.get(name) ?? new Set(), forced));
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(ctx.sf, visit);
  return map;
}

/** The conditions under which a local function is called inside its own file. */
function internalInvocationForced(ctx, name) {
  let forced = new Set();
  for (const site of callSitesOf(ctx, name)) {
    forced = unionOf(forced, conditionsAt(site.node, ctx));
  }
  return forced;
}

// ------------------------------------------------------------- the analysis

/**
 * One tree node, analysed.
 *
 * The children are analysed first, because a control in this component can be
 * reached through a function the child calls, and the child's call site is
 * what decides what forces it.
 */
function analyseNode(session, node) {
  const ctx = ctxFor(session, node.file);
  const children = node.children.map((child) => analyseNode(session, child));
  const propForced = propCallForced(ctx);
  const triggers = findTriggers(ctx);
  const paths = localPathsOf(ctx);

  const results = [];
  for (const trigger of triggers) {
    let forced = new Set(node.forced);
    for (const permission of conditionsAt(trigger.node, ctx)) forced.add(permission);

    /*
     * HOUSE RULE 9. The component the control lives in may be rendered by its
     * own file, behind conditions the control's own body knows nothing about.
     */
    const component = outermostFunctionName(trigger.node);
    if (component && ctx.functions.has(component)) {
      forced = unionOf(forced, paths.forcedOf(component, new Set()));
    }

    const enclosing = enclosingLocalFunction(trigger.node, ctx);
    if (enclosing) {
      forced = unionOf(forced, internalInvocationForced(ctx, enclosing));
      for (const child of children) {
        for (const [propName, values] of child.node.site.attrs) {
          for (const value of values) {
            if (!ts.isIdentifier(value.expr)) continue;
            if (value.expr.text !== enclosing) continue;
            forced = unionOf(forced, child.propForced.get(propName) ?? new Set());
          }
        }
      }
    }

    results.push({ trigger, forced });
  }

  return { node, children, triggers: results, propForced };
}

/** The permission a page demands, read from its own `requirePagePermission`. */
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

/**
 * One page, and the verdict on every permission it writes with.
 *
 * For every permission that a write on the page needs, and for every role
 * that can reach the page without holding it, every control that performs the
 * write has to sit behind a guard that forces the permission.
 */
function analysePage(pageFile, matrix) {
  const session = createSession(matrix);
  const page = parse(pageFile);
  const permission = pagePermission(page);

  if (!permission) {
    return { file: pageFile, permission: null, verdict: 'no-page-permission', checks: [] };
  }

  const reaching = Object.keys(matrix).filter((role) => can(matrix, role, permission));
  const tree = buildTree(session, pageFile);

  // The render path: what forces each node, from the page down.
  const walk = (node) => {
    if (node.site) {
      const parentCtx = ctxFor(session, node.parent.file);
      const local = conditionsAt(node.site.node, parentCtx);
      node.forced = unionOf(node.parent.forced, local);
    }
    for (const child of node.children) walk(child);
  };
  walk(tree);

  const analysis = analyseNode(session, tree);

  /*
   * The same control can be reached by more than one path through the tree,
   * and a control is only safe if EVERY path guards it. So the paths are
   * merged, and the merged set is the INTERSECTION of what each path forced:
   * one unguarded path is enough to make the control unsafe, and that is the
   * whole point of looking for it.
   */
  const byPermission = new Map();
  const merged = new Map();
  const collect = (node) => {
    for (const entry of node.triggers) {
      const source = entry.trigger.node.getSourceFile();
      const line = source.getLineAndCharacterOfPosition(entry.trigger.node.getStart()).line + 1;
      const key = `${rel(node.node.file)}:${line}:${entry.trigger.action}`;
      const existing = merged.get(key);
      if (existing) {
        existing.forced = intersectOf(existing.forced, entry.forced);
      } else {
        merged.set(key, {
          action: entry.trigger.action,
          permission: entry.trigger.permission,
          shape: entry.trigger.shape,
          file: node.node.file,
          line,
          forced: new Set(entry.forced),
        });
      }
    }
    for (const child of node.children) collect(child);
  };
  collect(analysis);

  for (const control of merged.values()) {
    const list = byPermission.get(control.permission) ?? [];
    list.push(control);
    byPermission.set(control.permission, list);
  }

  const checks = [];
  for (const [writePermission, controls] of [...byPermission.entries()].sort()) {
    const blocked = reaching.filter((role) => !can(matrix, role, writePermission));
    if (!blocked.length) {
      checks.push({
        permission: writePermission,
        verdict: 'permitted-for-every-reachable-role',
        blocked,
        controls,
      });
      continue;
    }
    const unguarded = controls.filter((control) => !control.forced.has(writePermission));
    checks.push({
      permission: writePermission,
      verdict: unguarded.length ? 'unguarded' : 'guarded',
      blocked,
      controls,
      unguarded,
    });
  }

  return { file: pageFile, permission, reaching, checks };
}

// ---------------------------------------------------------------- self-test

/**
 * A gate with no fixture cannot be shown to fail.
 *
 * The fixture is a miniature of the real defect: a page a student can reach,
 * whose control writes, and which no guard stands in front of.
 */
function selfTest() {
  const matrix = {
    instructor: { 'thing:read': 'yes', 'thing:write': 'yes' },
    student: { 'thing:read': 'own', 'thing:write': 'no' },
  };

  const dir = path.join(ROOT, 'src', '.verify-role-guards-selftest');
  fs.mkdirSync(dir, { recursive: true });

  const actions = `'use server';
import { requirePermission } from '@/lib/auth/guards';

export async function saveThing() {
  const session = await requirePermission('thing:write');
  return { ok: true, session };
}
`;

  const page = `import { requirePagePermission } from '@/lib/auth/guards';

import { Manager } from './manager';

export default async function Page() {
  const session = await requirePagePermission('thing:read');
  return <Manager role={session.role} />;
}
`;

  const cases = [
    {
      name: 'a student-reachable page that offers a write it cannot perform',
      manager: `import { can } from '@/lib/auth/rbac';

import { saveThing } from './actions';

export function Manager({ role }: { role: string | undefined }) {
  return (
    <button onClick={() => saveThing()}>Save</button>
  );
}
`,
      expect: 'unguarded',
    },
    {
      name: 'the same control behind the guard the application writes',
      manager: `import { can } from '@/lib/auth/rbac';

import { saveThing } from './actions';

export function Manager({ role }: { role: string | undefined }) {
  const mayWrite = can(role, 'thing:write');
  return <div>{mayWrite ? <button onClick={() => saveThing()}>Save</button> : null}</div>;
}
`,
      expect: 'guarded',
    },
    {
      name: 'a control in a child component the parent renders behind the guard',
      manager: `import { can } from '@/lib/auth/rbac';

import { SaveButton } from './save-button';

export function Manager({ role }: { role: string | undefined }) {
  const mayWrite = can(role, 'thing:write');
  return <div>{mayWrite ? <SaveButton /> : null}</div>;
}
`,
      extra: {
        'save-button.tsx': `import { saveThing } from './actions';

export function SaveButton() {
  return <button onClick={() => saveThing()}>Save</button>;
}
`,
      },
      expect: 'guarded',
    },
    {
      name: 'a control in a child component the parent renders with no guard',
      manager: `import { SaveButton } from './save-button';

export function Manager({ role }: { role: string | undefined }) {
  return (
    <div>
      <SaveButton />
    </div>
  );
}
`,
      extra: {
        'save-button.tsx': `import { saveThing } from './actions';

export function SaveButton() {
  return <button onClick={() => saveThing()}>Save</button>;
}
`,
      },
      expect: 'unguarded',
    },
    {
      name: 'a control whose guard arrives as a prop derived from can()',
      manager: `import { can } from '@/lib/auth/rbac';

import { SaveButton } from './save-button';

export function Manager({ role }: { role: string | undefined }) {
  const mayWrite = can(role, 'thing:write');
  return <SaveButton mayWrite={mayWrite} />;
}
`,
      extra: {
        'save-button.tsx': `import { saveThing } from './actions';

export function SaveButton({ mayWrite }: { mayWrite: boolean }) {
  return <div>{mayWrite ? <button onClick={() => saveThing()}>Save</button> : null}</div>;
}
`,
      },
      expect: 'guarded',
    },
    {
      name: 'a page whose write every reachable role may perform',
      manager: `import { saveThing } from './actions';

export function Manager({ role }: { role: string | undefined }) {
  return (
    <button onClick={() => saveThing()}>Save</button>
  );
}
`,
      expect: 'unguarded',
      matrix: {
        instructor: { 'thing:read': 'yes', 'thing:write': 'yes' },
        student: { 'thing:read': 'own', 'thing:write': 'own' },
      },
      expectVerdict: 'permitted-for-every-reachable-role',
    },
  ];

  let ok = true;
  for (const [index, testCase] of cases.entries()) {
    /*
     * Each case gets its own directory, so the relative imports inside the
     * fixture resolve exactly as they do in a real page. A fixture whose
     * imports do not resolve is a fixture that finds nothing, and a gate that
     * finds nothing on a fixture is a gate that cannot be shown to work.
     */
    const caseDir = path.join(dir, `case-${index}`);
    fs.mkdirSync(caseDir, { recursive: true });
    const pageFile = path.join(caseDir, 'page.tsx');
    fs.writeFileSync(pageFile, page, 'utf8');
    fs.writeFileSync(path.join(caseDir, 'actions.ts'), actions, 'utf8');
    fs.writeFileSync(path.join(caseDir, 'manager.tsx'), testCase.manager, 'utf8');
    for (const [name, source] of Object.entries(testCase.extra ?? {})) {
      fs.writeFileSync(path.join(caseDir, name), source, 'utf8');
    }

    const result = analysePage(pageFile, testCase.matrix ?? matrix);
    const check = result.checks.find((c) => c.permission === 'thing:write');
    const got = check?.verdict;
    const expected = testCase.expectVerdict ?? testCase.expect;
    if (got !== expected) {
      ok = false;
      console.log(`FAIL  ${testCase.name}: expected ${expected}, got ${got}`);
    }
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a temp directory is not worth a failed gate */
  }

  if (ok) {
    console.log(`PASS  self-test: ${cases.length} control cases classified as expected`);
  }
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

const pages = pageFiles(APP);
const results = [];
for (const page of pages) {
  results.push(analysePage(page, matrix));
}

console.log(
  `verify:role-guards — ${pages.length} page(s), ${roles.length} roles in the matrix ` +
    `(${roles.join(', ')})\n`,
);

const failures = [];
const counts = {};
let totalChecks = 0;

for (const result of results) {
  if (result.verdict === 'no-page-permission') {
    counts['no-page-permission'] = (counts['no-page-permission'] ?? 0) + 1;
    console.log(`${'no page permission'.padEnd(20)} ${rel(result.file)}`);
    continue;
  }
  const route = '/' + rel(result.file).replace(/^src\/app\//, '').replace(/\/page\.tsx$/, '').replace(/\([^)]*\)\//g, '');
  const heading = `${route}  (${result.permission})  reachable: ${result.reaching.join(', ')}`;
  console.log(heading);
  for (const check of result.checks) {
    totalChecks += 1;
    counts[check.verdict] = (counts[check.verdict] ?? 0) + 1;
    const detail =
      check.verdict === 'unguarded'
        ? `${check.unguarded.length} of ${check.controls.length} control(s) are not behind a ${check.permission} guard`
        : check.verdict === 'permitted-for-every-reachable-role'
          ? `${check.controls.length} control(s), and every role that reaches this page may do it`
          : `${check.controls.length} control(s), every one behind a ${check.permission} guard`;
    console.log(`  ${check.verdict.padEnd(34)} ${check.permission.padEnd(18)} ${detail}`);
    if (check.verdict === 'unguarded') {
      failures.push({ result, check });
      console.log(
        `      ${check.blocked.join(', ')} can reach this page and cannot ${check.permission.replace(':', ' ')}, ` +
          'so these controls would be refused.',
      );
      for (const control of check.unguarded) {
        console.log(`      ${rel(control.file)}:${control.line}  ${control.action} (${control.shape})`);
      }
    }
  }
  console.log('');
}

console.log(
  `${pages.length} page(s), ${totalChecks} permission check(s): ` +
    `${Object.entries(counts)
      .map(([key, value]) => `${value} ${key}`)
      .join(', ')}`,
);

if (failures.length) {
  console.log(`\nFAIL  ${failures.length} permission check(s) are not guarded.`);
  process.exit(1);
}

console.log('\nPASS  every write control sits behind the guard for the permission it needs.');
