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
 * The tags that become a pressable thing.
 *
 * `<Button>` MATTERS MORE THAN `<button>`. The first version of this gate
 * matched the lowercase tag only and found 24 controls across 144 files, which
 * is not credible for a dashboard: almost every control in the product is the
 * shadcn `<Button>` wrapper, and that wrapper is a capital-B component the
 * lowercase match could not see. A gate that quietly examines a twentieth of
 * the surface and reports zero is worse than no gate, because it looks like
 * coverage.
 */
const CONTROL_TAGS = new Set(['button', 'Button']);

/**
 * Parents that hand their child a handler.
 *
 * Radix's `asChild` merges its own props into the child through cloneElement, so
 * the child carries no `onClick` of its own and is nonetheless live. The first
 * version of this script checked `asChild` on the button, found exactly one
 * candidate in the whole repository, and it was this pattern on the schedule's
 * "Add a class" control: working code, reported as dead.
 *
 * THE LIST IS MEASURED, NOT GUESSED. Every `<X asChild>` in `src` was counted,
 * and `Button` is deliberately absent from it. Radix's trigger and close
 * primitives merge props; shadcn's `Button asChild` only swaps which element is
 * rendered, so a button wrapped in one is genuinely unwired.
 *
 *   DialogTrigger 13   DropdownMenuItem 3   DropdownMenuTrigger 2
 *   SheetTrigger 1     DialogClose 1        Button 11 (excluded, see above)
 *
 * A wrapper not on this list that merges props will be reported as dead. That
 * is the safe direction to be wrong in: a false positive here costs one line
 * of review, and a false negative ships a control that cannot be pressed.
 */
const INJECTING_PARENTS = [
  'DialogTrigger',
  'DialogClose',
  'SheetTrigger',
  'DropdownMenuTrigger',
  'DropdownMenuItem',
];

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
let filesVisited = 0;
let buttonsSeen = 0;

for (const file of tsxFiles(ROOT)) {
  filesVisited += 1;
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = relative('.', file);

  const visit = (node, injected = false) => {
    const opening =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;

    if (opening && CONTROL_TAGS.has(opening.tagName?.getText() ?? '')) {
      buttonsSeen += 1;
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
      /*
       * A bare `disabled` carries no initializer text, so reading it as a
       * string gives ''. Both shapes mean the same thing and are recorded the
       * same way, which is what stopped a deliberately inert button being
       * reported as a dead one.
       */
      const disabled = attrs.has('disabled') ? (attrs.get('disabled') || 'true') : '';

      if (spread) findings.unexamined.push(at);
      else if (!hasHandler && attrs.get('type') !== '"submit"' && !asChild) {
        if (disabled) findings.inert.push(`${at}  disabled=${String(disabled).slice(0, 46)}`);
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

const blocking = [...findings.unwired, ...findings.unexamined];

/*
 * A SCAN THAT FOUND NOTHING HAS TO PROVE IT FOUND SOMETHING.
 *
 * Without this, a gate that read zero files prints the same line as a gate that
 * read all of them, and the two are indistinguishable to whoever reads the log.
 * The corpus size is printed on success and an empty corpus is a failure, not a
 * pass. Raised independently by a second pass over this script, which is the
 * correct kind of review and is the reason this floor is here at all.
 */
if (filesVisited === 0 || buttonsSeen === 0) {
  console.error(`FAIL  read ${filesVisited} file(s) and found ${buttonsSeen} controls.`);
  console.error('      A scan that examined nothing has proved nothing. Check the ROOT path');
  console.error('      and that it still points at a tree with controls in it.');
  process.exit(1);
}

/*
 * INERT IS REPORTED AND DOES NOT FAIL.
 *
 * A disabled control is sometimes exactly right: the theme toggle reads
 * "Following system" and explains that storing a choice needs storage the
 * teacher declined, and that button is correct. Making the gate red for it
 * would be a gate that fails on correct code, which is the failure mode this
 * project keeps meeting. So it is printed, loudly, and left for a reader.
 */
if (findings.inert.length > 0) {
  console.log(`note  ${findings.inert.length} deliberately disabled control(s):`);
  for (const line of findings.inert) console.log(`        ${line}`);
}

if (blocking.length === 0) {
  console.log(
    `ok    every control under ${ROOT} has something attached to it ` +
      `(${buttonsSeen} controls in ${filesVisited} files)`,
  );
  console.log(`      0 unwired, 0 unexamined, ${findings.inert.length} inert`);
  process.exit(0);
}

console.error(`FAIL  ${blocking.length} control(s) with nothing behind them`);
console.error(`      scanned ${buttonsSeen} controls in ${filesVisited} files\n`);
for (const line of findings.unwired) console.error(`  no handler        ${line}`);
for (const line of findings.unexamined) console.error(`  unexamined spread ${line}`);
console.error('\nA control in this list cannot be pressed into doing anything.');
process.exit(1);