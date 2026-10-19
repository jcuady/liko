/**
 * Do any controls in the dashboard do nothing?
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST. It reads every `.tsx` file under `src`
 * and parses each one with the TypeScript compiler, which is a job the unit
 * suite cannot do: vitest collects `*.test.ts`, never `.tsx`, and a check that
 * never runs is not a check.
 *
 * WHY IT IS PARSED AND NOT GREPPED. The previous attempt at this question used
 * a regex over `<button`, and reported nineteen buttons in a codebase that has
 * well over a hundred. The second version used the compiler and reported one,
 * and that one was also wrong. Both numbers were confident and both were false.
 * A regex cannot see a handler that arrives through `cloneElement`, and it
 * cannot tell a `<button` from a `<buttonSomething`.
 *
 * WHAT COUNTS AS WIRED. A button is considered live when it has any of:
 *
 *   onClick / onPointerDown / onMouseDown / onDoubleClick / onKeyDown
 *   type="submit"                     it submits a form
 *   asChild on itself or an ancestor  the parent injects the handler
 *   disabled={expression}             reported separately, not excused
 *
 * WHAT IT DOES NOT COVER, STATED PLAINLY BECAUSE A GATE THAT HIDES ITS LIMITS
 * IS WORSE THAN NO GATE.
 *
 *   - A control that is not a `<button>`: a div with onClick, a link to a route
 *     that does not exist, an input wired to a filter that never fires.
 *   - A button whose handler does something wrong. This asks "is anything
 *     attached", not "does it work".
 *   - A handler passed through a variable into an ordinary attribute. Only a
 *     JSX spread is recognised, and a spread is reported as unexamined rather
 *     than as clean.
 *
 * Run:
 *   node scripts/verify-controls.mjs
 *
 * Exit 0 when every control is wired. Exit 1 and a named list when any is not.
 */

import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';

/** Attribute names that mean "something happens when this is pressed". */
const HANDLERS = ['onClick', 'onPointerDown', 'onMouseDown', 'onDoubleClick', 'onKeyDown'];

/**
 * Parents that hand their child a handler.
 *
 * Radix's `asChild` merges its own props into the child through cloneElement, so
 * the child carries no `onClick` of its own and is nonetheless live. The first
 * version of this script checked `asChild` on the button, found exactly one
 * candidate in the whole repository, and it was this pattern on the schedule's
 * "Add a class" control: working code, reported as dead.
 */
const INJECTING_PARENTS = ['DialogTrigger', 'DropdownMenuTrigger', 'TooltipTrigger', 'PopoverTrigger'];

function tsxFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...tsxFiles(full));
    else if (name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

const findings = { unwired: [], inert: [], unexamined: [] };

for (const file of tsxFiles(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = relative('.', file);

  const visit = (node, injected = false) => {
    const opening =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;

    if (opening && opening.tagName?.getText() === 'button') {
      const attrs = new Map();
      opening.attributes.properties.forEach((prop) => {
        if (ts.isJsxAttribute(prop)) attrs.set(prop.name.getText(), prop.initializer?.getText() ?? '');
      });

      const line = source.getLineAndCharacterOfPosition(opening.getStart()).line + 1;
      const label =
        attrs.get('aria-label')?.replace(/^"|"$/g, '').replace(/\$\{[^}]*\}/g, 'a day') ??
        (text.slice(opening.getStart(), opening.getEnd()).match(/>([^<>{}]{1,40})</)?.[1] ?? '').trim();
      const at = `${where}:${line}  ${label}`;

      const spread = opening.attributes.properties.some(
        (prop) => prop.kind === ts.SyntaxKind.JsxSpreadAttribute,
      );
      const hasHandler = HANDLERS.some((name) => attrs.has(name));
      const asChild = attrs.has('asChild') || injected;
      const disabled = attrs.get('disabled');

      if (spread) findings.unexamined.push(at);
      else if (!hasHandler && attrs.get('type') !== '"submit"' && !asChild) {
        // A bare `disabled` has no initializer text, and lands here too, which
        // is deliberate: it is still a button with nothing behind it.
        if (disabled && disabled !== 'true') findings.inert.push(`${at}  disabled=${disabled.slice(0, 50)}`);
        else findings.unwired.push(at);
      }
    }

    const childInjected =
      injected ||
      (ts.isJsxElement(node) &&
        ts.isJsxOpeningElement(node.openingElement) &&
        INJECTING_PARENTS.includes(node.openingElement.tagName?.getText()) &&
        node.openingElement.attributes.properties.some(
          (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === 'asChild',
        ));

    ts.forEachChild(node, (child) => visit(child, childInjected));
  };

  visit(source, false);
}

const all = [...findings.unwired, ...findings.inert, ...findings.unexamined];

if (all.length === 0) {
  console.log(`ok    every button under ${ROOT} has something attached to it`);
  console.log(`      ${findings.unwired.length} unwired, ${findings.inert.length} inert, ${findings.unexamined.length} unexamined`);
  process.exit(0);
}

console.error(`FAIL  ${all.length} control(s) with nothing behind them\n`);
for (const line of findings.unwired) console.error(`  no handler        ${line}`);
for (const line of findings.inert) console.error(`  inert             ${line}`);
for (const line of findings.unexamined) console.error(`  unexamined spread ${line}`);
console.error('\nA control in this list cannot be pressed into doing anything.');
process.exit(1);