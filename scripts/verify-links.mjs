/**
 * Does every internal link in the product point at a page that exists?
 *
 * WHY A SCRIPT AND NOT A TEST. It walks the App Router on disk to build the set
 * of real URLs, then parses every `.tsx` under `src` to collect the `href`s
 * written in the source. The unit suite collects `*.test.ts` and never sees a
 * `.tsx`, and a check that never runs is not a check.
 *
 * WHY IT IS PARSED AND NOT GREPPED. The dead-control gate in this repository
 * went through a regex first and reported a confident, wrong number before the
 * parser replaced it. A `href` can be written four ways, only one of which is a
 * bare quoted string, and a grep cannot tell `href="/x"` from `x.href` or from
 * the same text inside a comment.
 *
 * WHAT COUNTS AS RESOLVING.
 *
 *   /classes              ->  src/app/(dashboard)/classes/page.tsx
 *   /slides/abc           ->  src/app/(dashboard)/slides/[deckId]/page.tsx
 *   /slides               ->  matches the parent of a dynamic segment
 *   /?x=1 and /a#b        ->  the query and fragment are not part of the route
 *
 * Route groups in parentheses and parallel routes in @slots do not appear in a
 * URL, so they are dropped when building the set. Catch-all segments match any
 * number of segments.
 *
 * WHAT IT DOES NOT COVER, because a gate that hides its limits is worse than no
 * gate.
 *
 *   - `router.push('/x')` and `redirect('/x')`, which are not `href`s. Those
 *     are the next question, not this one.
 *   - Whether the destination then permits the reader. That is `verify:app`'s
 *     job and it already does it per role.
 *   - A link built entirely from an expression, which has no static prefix to
 *     check. It is reported as unexamined rather than quietly counted as clean.
 *
 * Run:
 *   node scripts/verify-links.mjs
 *
 * Exit 0 when every internal link resolves. Exit 1 and a named list when any
 * does not.
 */

import ts from 'typescript';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP = join('src', 'app');
const SRC = 'src';

/** URL segments that exist on disk but never in a URL. */
const INVISIBLE = (segment) =>
  (segment.startsWith('(') && segment.endsWith(')')) ||
  segment.startsWith('@') ||
  segment.startsWith('_');

/** True when a directory segment is a dynamic one, e.g. `[deckId]` or `[...all]`. */
function dynamicKind(segment) {
  if (/^\[\[\.\.\..+\]\]$/.test(segment)) return 'optional-catchall';
  if (/^\[\.\.\..+\]$/.test(segment)) return 'catchall';
  if (/^\[.+\]$/.test(segment)) return 'single';
  return null;
}

/**
 * Every URL the App Router will answer.
 *
 * Each entry is the segment list with `(groups)` and `@slots` removed, and each
 * dynamic segment left as its literal `[name]` so matching can be done against
 * it rather than guessed at afterwards.
 */
function realRoutes() {
  const routes = [];

  const walk = (dir, segments) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;

      /*
       * A route group is TRANSPARENT, not absent.
       *
       * `(dashboard)` contributes no URL segment, but the pages inside it are
       * real pages and have to be walked into. The first version of this
       * function `continue`d past any `(group)`, which left the route set
       * holding ten top-level marketing pages and nothing else, and then
       * cheerfully reported `/login` as a link to nowhere. Thirty-six
       * confident wrong answers from one missing `else`.
       */
      const here = INVISIBLE(name) ? segments : [...segments, name];

      const isPage = existsSync(join(full, 'page.tsx'));
      const isRoute = existsSync(join(full, 'route.ts'));
      if (isPage) routes.push({ segments: here, kind: 'page', file: join(full, 'page.tsx') });
      if (isRoute) routes.push({ segments: here, kind: 'route', file: join(full, 'route.ts') });

      walk(full, here);
    }
  };

  walk(APP, []);
  return routes;
}

/**
 * Whether a URL's segments are satisfied by a route's segments.
 *
 * `single` consumes exactly one segment, `catchall` one or more, and
 * `optional-catchall` zero or more. An empty remainder matches, which is what
 * lets `/slides` reach the parent of `/slides/[deckId]`.
 */
function matches(routeSegments, urlSegments) {
  const pattern = routeSegments.map((segment) => dynamicKind(segment) ?? 'static');

  let at = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const kind = pattern[i];
    if (kind === 'static') {
      if (urlSegments[at] !== routeSegments[i]) return false;
      at += 1;
    } else if (kind === 'single') {
      if (at >= urlSegments.length) return false;
      at += 1;
    } else if (kind === 'catchall') {
      if (at >= urlSegments.length) return false;
      at = urlSegments.length;
    } else {
      at = urlSegments.length;
    }
  }
  return at === urlSegments.length;
}

function tsxFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...tsxFiles(full));
    else if (name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

const routes = realRoutes();
const broken = [];
const unexamined = [];
let linksSeen = 0;

/** The static part of a `href`, or null when it cannot be read statically. */
function hrefValue(initializer) {
  if (!initializer) return '';
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer)) {
    const inner = initializer.expression;
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
    if (ts.isTemplateExpression(inner)) return inner.head.text;
    if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return hrefValue({ expression: inner.left }) ?? '';
    }
  }
  return null;
}

/** True when a static prefix runs out of segments into an interpolation. */
function isPartial(raw) {
  return raw.endsWith('/') || /[?&]$/.test(raw) || raw.endsWith('=');
}

for (const file of tsxFiles(SRC)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = relative('.', file).split(sep).join('/');

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === 'href') {
      const raw = hrefValue(node.initializer);
      if (raw === null) return;

      const at = `${where}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

      // External, a bare fragment, or a protocol-relative URL.
      if (/^(https?:|mailto:|tel:|\/\/|#)/.test(raw)) return;

      /*
       * `href=""` IS worth reporting and a template is not, because the first
       * points nowhere and the second points somewhere this function cannot
       * read. Both used to land in the same "unexamined" bucket, which mixed a
       * defect with a limit.
       */
      if (raw === '' && !isPartial(raw)) {
        broken.push(`${at}  href="" (points nowhere)`);
        return;
      }
      if (raw === '') return;

      linksSeen += 1;
      const partial = isPartial(raw);
      let path = raw.split('#')[0].split('?')[0];
      if (partial && path.endsWith('/')) path = path.slice(0, -1);

      const urlSegments = path.split('/').filter((segment) => segment !== '');
      const hit = routes.find((route) => matches(route.segments, urlSegments));

      if (hit) return;
      if (partial) unexamined.push(`${at}  ${raw} (prefix resolves to ${hit ? hit.segments.join('/') : 'nothing'})`);
      else broken.push(`${at}  href="${raw}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

/*
 * A SCAN THAT FOUND NOTHING HAS TO PROVE IT FOUND SOMETHING.
 *
 * The dead-control gate learned this the hard way: it printed a zero without
 * saying how much it had read, so a run that examined nothing looked identical
 * to a clean one. Both counts are printed and an empty corpus fails.
 */
if (routes.length === 0 || linksSeen + unexamined.length === 0) {
  console.error(
    `FAIL  built ${routes.length} route(s) and read ${linksSeen + unexamined.length} link(s).`,
  );
  console.error('      A scan that examined nothing has proved nothing.');
  process.exit(1);
}

console.log(
  `      ${routes.length} routes, ${linksSeen} internal links, ${unexamined.length} unexamined`,
);

if (unexamined.length > 0) {
  console.log(`note  ${unexamined.length} link(s) built from an expression:`);
  for (const line of unexamined) console.log(`        ${line}`);
}

if (broken.length > 0) {
  console.error(`\nFAIL  ${broken.length} link(s) point at a route that does not exist:`);
  for (const line of broken) console.error(`  ${line}`);
  console.error('\nKnown routes:');
  for (const route of routes.filter((r) => r.kind === 'page')) {
    console.error(`  /${route.segments.join('/')}`);
  }
  process.exit(1);
}

console.log('ok    every internal link resolves to a route that exists');
process.exit(0);