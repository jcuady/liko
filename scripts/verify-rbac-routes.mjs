/**
 * Does every route-permission rule actually gate a route?
 *
 * WHY THIS IS A GATE AND NOT A NOTE. `ROUTE_PERMISSIONS` is a list of prefixes
 * that decide which role may open which page, and **nothing asserted that each
 * prefix matches a real route.** A typo there is invisible: `/grdes` matches
 * nothing, the gradebook stops being gated at the proxy, no rule reports the
 * miss, and the page renders for a role that was never meant to open it. The
 * rule looks present in the source, the route looks present on disk, and the
 * gap between them is not a thing any existing check can see.
 *
 * The proxy is documented as an optimisation and not the security boundary --
 * every server action re-checks a permission. So the consequence of a dead rule
 * is not a data leak; it is that a page becomes reachable by a role that has no
 * business there, rendering data that RLS then scopes. That is worth catching
 * anyway, because the next person to read `ROUTE_PERMISSIONS` assumes every
 * entry is doing work.
 *
 * WHY THE MATCHER IS COPIED, NOT IMPORTED. This file cannot import a TypeScript
 * module directly. The matcher below is therefore a verbatim copy of
 * `permissionForPath`'s condition, and it says so at the point of use. A gate
 * that tested a *different* rule from the one the application applies would be
 * a gate about the gate.
 *
 * WHY IT PARSES RATHER THAN GREPS. The same reason as `verify-controls`,
 * `verify-filters` and `verify:links`: a regex over source is narrower than the
 * source, and this needs the actual literal values.
 *
 * WHAT IT DOES NOT CLAIM.
 *
 *   - That every session-gated page HAS a rule. Several deliberately do not:
 *     `/forbidden` must render for whoever was refused, `/settings` is role
 *     agnostic, and every public page under `src/app/(marketing)` and the legal
 *     routes must render for an anonymous visitor. Only the reverse is asserted
 *     -- that no rule is dead -- because a rule matching nothing is wrong in
 *     every case, while a page matching no rule is a design decision.
 *   - That the permissions named here are the right ones. That is what the unit
 *     suite's `rbac.test.ts` and the live `verify:app` refusals cover.
 *
 * Run:
 *   node scripts/verify-rbac-routes.mjs
 *
 * Exit 0 when every rule gates at least one route. Exit 1 and a named list when
 * any rule gates none.
 */

import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join('src', 'app');
const RBAC = join('src', 'lib', 'auth', 'rbac.ts');

/** The condition `permissionForPath` uses, copied so the gate tests the same rule. */
function ruleMatches(prefix, pathname) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/* --- the rules, parsed out of the source ---------------------------------- */
const source = ts.createSourceFile(
  RBAC,
  readFileSync(RBAC, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const rules = [];
const collect = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText() === 'ROUTE_PERMISSIONS') {
    const init = node.initializer;
    if (init && ts.isArrayLiteralExpression(init)) {
      for (const element of init.elements) {
        const props = {};
        for (const p of element.properties) {
          if (ts.isPropertyAssignment(p)) {
            props[p.name.getText()] = p.initializer.getText().replace(/^['"]|['"]$/g, '');
          }
        }
        if (props.prefix) rules.push(props);
      }
    }
  }
  ts.forEachChild(node, collect);
};
collect(source);

/* --- the routes, walked off disk ------------------------------------------ */
function pageFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...pageFiles(full));
    else if (name === 'page.tsx') found.push(full);
  }
  return found;
}

/**
 * The route a page file serves.
 *
 * Route groups -- `(dashboard)`, `(marketing)`, `(auth)`, `(sheet)` -- are not
 * part of the URL, so they are dropped. Dynamic segments are KEPT, because
 * `permissionForPath` is handed the path with its segment in it and has to
 * match the prefix either way.
 */
function routeOf(file) {
  const cleaned = relative(APP, file)
    .replace(/\\/g, '/')
    .replace(/\/page\.tsx$/, '')
    .split('/')
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter(Boolean)
    .join('/');
  return `/${cleaned}`.replace(/\/$/, '') || '/';
}

const routes = pageFiles(APP).map((file) => routeOf(file));
const uniqueRoutes = [...new Set(routes)];

/*
 * A SCAN THAT FOUND NOTHING HAS TO PROVE IT FOUND SOMETHING.
 *
 * If the parser stopped matching the literal it silently returns an empty rule
 * list, and a gate with nothing to check prints the same line as a gate that
 * checked everything. Both counts are asserted, and both are printed.
 */
if (rules.length === 0 || uniqueRoutes.length === 0) {
  console.error(
    `FAIL  read ${rules.length} route rule(s) and ${uniqueRoutes.length} route(s).`,
  );
  console.error('      A scan that examined nothing has proved nothing.');
  process.exit(1);
}

const dead = rules.filter((rule) => !uniqueRoutes.some((route) => ruleMatches(rule.prefix, route)));

if (dead.length === 0) {
  const covered = uniqueRoutes.filter((route) =>
    rules.some((rule) => ruleMatches(rule.prefix, route)),
  );
  console.log(
    `ok    every route-permission rule gates at least one real route ` +
      `(${rules.length} rules over ${uniqueRoutes.length} routes; ${covered.length} gated)`,
  );
  console.log(`      ${dead.length} dead rule(s)`);
  process.exit(0);
}

console.error(
  `FAIL  ${dead.length} route rule(s) gate no route at all\n`,
);
for (const rule of dead) {
  console.error(
    `  ${rule.prefix.padEnd(14)} requires ${rule.permission ?? '(no permission)'}`,
  );
}
console.error(
  '\nA rule that matches no route is doing nothing. Either the prefix is misspelled,\n' +
    'in which case the page it was written to protect is no longer gated, or the route\n' +
    'was renamed and the rule was left behind.',
);
process.exit(1);