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
const appRoles = [];
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
  if (ts.isVariableDeclaration(node) && node.name.getText() === 'ROLES') {
    /*
     * `ROLES` is declared `as const`, so the initializer is an AsExpression
     * wrapping the array literal rather than the array literal itself. The
     * vacuity guard below is what caught that: with the wrapper unhandled the
     * parser read zero roles, which the guard refused rather than reporting
     * an empty list as an empty app.
     */
    const init = ts.isAsExpression(node.initializer)
      ? node.initializer.expression
      : node.initializer;
    if (init && ts.isArrayLiteralExpression(init)) {
      for (const element of init.elements) {
        appRoles.push(element.getText().replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  ts.forEachChild(node, collect);
};
collect(source);

/* --- the roles, from the app and from the database ------------------------- */
/*
 * THE APP'S ROLE LIST AND THE DATABASE'S MUST BE THE SAME LIST.
 *
 * `ROLES` in `rbac.ts` is what the application will accept, and
 * `check (role in (...))` in the migration is what the database will store.
 * They agree today and NOTHING ASSERTED IT, so a role added to one and not the
 * other is silent: the application writes a row the database refuses, and the
 * refusal reads as a generic constraint error rather than as a drift.
 *
 * The constraint is read from the migration file rather than from the live
 * database, because this gate runs offline and the migration is the thing that
 * declares the schema. `db:check` answers whether the LIVE database matches
 * the migration; this answers whether the APPLICATION matches it. Neither
 * question covers the other.
 *
 * `created_by_role` is deliberately NOT compared. It is a different column
 * with a different meaning -- who issued an invitation -- and a guardian
 * cannot issue one, so it carries a narrower list on purpose. The pattern
 * below anchors on the column named exactly `role`, which `created_by_role`
 * does not match.
 */
const MIGRATIONS = join('supabase', 'migrations');

function migrationFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...migrationFiles(full));
    else if (name.endsWith('.sql')) found.push(full);
  }
  return found;
}

const dbRoleSets = [];
for (const file of migrationFiles(MIGRATIONS)) {
  const sql = readFileSync(file, 'utf8');
  const pattern = /check\s*\(\s*role\s+in\s*\(([^)]*)\)/g;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    const roles = match[1]
      .split(',')
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    dbRoleSets.push({ file: relative('.', file), roles });
  }
}

/*
 * Every constraint on a `role` column has to carry the same list. If the
 * migration declares two of them and they disagree, the application cannot
 * satisfy both, and which one bites depends on which table the write landed
 * in -- so they are compared against the app's list as a group.
 */
const uniqueDbRoleSets = [...new Map(dbRoleSets.map((entry) => [entry.roles.join(','), entry])).values()];

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

/*
 * AND THE ROLE SETS HAVE TO AGREE, OR NOTHING HAS PROVED ANYTHING ABOUT THEM.
 *
 * A parser that stopped matching the literal returns an empty list, and an
 * empty list compared to an empty list is equal. So the two lists are asserted
 * to be non-empty before they are compared, and the sets are printed either
 * way, so a reader can see what was compared rather than being told that
 * something matched.
 */
if (appRoles.length === 0 || uniqueDbRoleSets.length === 0) {
  console.error(
    `FAIL  read ${appRoles.length} app role(s) and ${uniqueDbRoleSets.length} database role set(s).`,
  );
  console.error('      A scan that examined nothing has proved nothing.');
  process.exit(1);
}

const appRoleSet = new Set(appRoles);
const roleDrift = uniqueDbRoleSets.filter(
  (entry) =>
    entry.roles.length !== appRoleSet.size ||
    entry.roles.some((role) => !appRoleSet.has(role)),
);

if (roleDrift.length > 0) {
  console.error(
    `FAIL  the application's role list and the database's are not the same list\n`,
  );
  console.error(`  app   (${appRoles.join(', ')})`);
  for (const entry of roleDrift) {
    console.error(`  db    (${entry.roles.join(', ')})  in ${entry.file}`);
  }
  console.error(
    '\nA role the application accepts but the database refuses is a write that fails\n' +
      'with a generic constraint error, and a role the database accepts but the\n' +
      'application does not is a row nothing can read. Neither announces itself.',
  );
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
  console.log(
    `ok    the application's roles and the database's are the same list ` +
      `(${appRoles.length} roles, ${dbRoleSets.length} declaration(s), ` +
      `${uniqueDbRoleSets.length} distinct set(s))`,
  );
  console.log(`      ${appRoles.join(', ')}`);
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