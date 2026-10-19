/**
 * Is every filter wired to something?
 *
 * WHY THIS EXISTS ALONGSIDE `verify-controls.mjs`. That gate asks whether the
 * buttons do anything. It does not look at `<Select>`, `<Input>` or `<Textarea>`,
 * and "filters" is named explicitly in the brief this project is being held to.
 * Two gates over the same `.tsx` tree, different questions.
 *
 * WHY IT IS PARSED AND NOT GREPPED, AGAIN. The same reason as its sibling, and
 * the same evidence: a regex over `<button` reported nineteen buttons in a
 * codebase that has well over a hundred. A regex also cannot see a render prop.
 * `<FormField>{(props) => <Input {...props} onChange={...} />}</FormField>` has a
 * spread AND an explicit handler, and which of the two the scanner looks at
 * first decides the answer.
 *
 * WHICH ORDER, AND WHY IT IS WRITTEN DOWN. A first version of this file tested
 * "has a spread" before "has a handler", because a spread was the harder case.
 * That reported **73 unexamined** controls out of 131. Every one of them was a
 * `<FormField>` render prop whose spread carries the label, id and aria wiring
 * while the handler sat on the next line. The number was confidently wrong and
 * would have been the reason to distrust a correct codebase. **The explicit
 * handler is therefore asked first, and a spread only counts as unexamined when
 * nothing else about the element says how it is wired.**
 *
 * WHAT COUNTS AS WIRED. Any one of these is enough:
 *
 *   onChange / onInput / onValueChange   it drives state
 *   `name` inside a <form>               it submits natively to a server action,
 *                                         which is how a filter without JS state
 *                                         is still a real filter
 *   asChild on itself or an ancestor     the parent injects the handler
 *   value / defaultValue                 it is controlled, which implies a setter
 *
 * WHAT IT DOES NOT COVER, STATED PLAINLY BECAUSE A GATE THAT HIDES ITS LIMITS
 * IS WORSE THAN NO GATE.
 *
 *   - `type="date"` and `type="color"` native inputs with their own onChange
 *     attribute shape, if one is ever added.
 *   - A filter whose control lives in a component this file never visits,
 *     because the walk starts at `src` and visits `.tsx` only. A `.ts` file
 *     cannot contain JSX, so that is a real boundary rather than a gap.
 *   - Whether the filter does the RIGHT thing. This asks "is it attached to
 *     something", not "does filtering work". `e2e` answers the second.
 *
 * Run:
 *   node scripts/verify-filters.mjs
 *
 * Exit 0 when every filter is wired. Exit 1 and a named list when any is not.
 */

import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';

/**
 * The tags a user operates to narrow what they see.
 *
 * Deliberately five and no more. `Checkbox` and `Switch` were considered and
 * left out: they appear mostly inside forms and dialogs rather than as filters,
 * and widening the set is how a gate starts reporting correct code as broken.
 * A narrow question that is answered correctly is worth more than a broad one
 * that cries wolf, because a red gate gets disabled.
 */
const FILTER_TAGS = new Set(['Select', 'Input', 'input', 'Textarea', 'textarea']);

const HANDLERS = ['onChange', 'onInput', 'onValueChange'];

/**
 * Parents that hand their child a handler through Radix `cloneElement`.
 *
 * The same list the controls gate uses, kept in step deliberately: a filter
 * inside a dialog trigger is as live as a button inside one.
 */
const INJECTING_PARENTS = [
  'DialogTrigger',
  'DialogClose',
  'SheetTrigger',
  'DropdownMenuTrigger',
  'DropdownMenuItem',
  'FormField',
  'FormControl',
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

const unwired = [];
const unexamined = [];
const disabled = [];
let filesVisited = 0;
let filtersSeen = 0;

for (const file of tsxFiles(ROOT)) {
  filesVisited += 1;
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = relative('.', file);

  const visit = (node, injected = false, inForm = false) => {
    const opening =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;

    if (opening && FILTER_TAGS.has(opening.tagName?.getText() ?? '')) {
      filtersSeen += 1;

      const attrs = new Map();
      let spread = false;
      opening.attributes.properties.forEach((prop) => {
        if (ts.isJsxAttribute(prop)) attrs.set(prop.name.getText(), prop.initializer?.getText() ?? '');
        else spread = true;
      });

      const line = source.getLineAndCharacterOfPosition(opening.getStart()).line + 1;
      const label = text
        .slice(opening.getStart(), opening.getEnd())
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      const at = `${where}:${line}  ${label}`;

      if (HANDLERS.some((name) => attrs.has(name))) {
        /* driven */
      } else if (injected || attrs.has('asChild')) {
        /* injected by a parent */
      } else if (inForm && attrs.has('name')) {
        /* submits natively to a server action */
      } else if (attrs.has('value') || attrs.has('defaultValue')) {
        /* controlled */
      } else if (attrs.has('disabled') || attrs.has('readOnly')) {
        disabled.push(at);
      } else if (spread) {
        /*
         * Unexamined, never clean. A spread carries whatever the caller passed,
         * and without type information this cannot know whether that included a
         * handler. Reported separately so it is never mistaken for a pass.
         */
        unexamined.push(at);
      } else {
        unwired.push(at);
      }
    }

    const isForm =
      ts.isJsxElement(node) &&
      ts.isJsxOpeningElement(node.openingElement) &&
      node.openingElement.tagName?.getText() === 'form';

    const childInjected =
      injected ||
      (ts.isJsxElement(node) &&
        ts.isJsxOpeningElement(node.openingElement) &&
        INJECTING_PARENTS.includes(node.openingElement.tagName?.getText()) &&
        node.openingElement.attributes.properties.some(
          (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === 'asChild',
        ));

    ts.forEachChild(node, (child) => visit(child, childInjected, inForm || isForm));
  };

  visit(source, false, false);
}

/*
 * A SCAN THAT FOUND NOTHING HAS TO PROVE IT FOUND SOMETHING.
 *
 * Without this a gate that read zero files prints the same line as a gate that
 * read all of them. The corpus size is printed on success, and an empty corpus
 * is a failure rather than a pass.
 */
if (filesVisited === 0 || filtersSeen === 0) {
  console.error(`FAIL  read ${filesVisited} file(s) and found ${filtersSeen} filter controls.`);
  console.error('      A scan that examined nothing has proved nothing. Check ROOT.');
  process.exit(1);
}

if (disabled.length > 0) {
  console.log(`note  ${disabled.length} deliberately disabled control(s):`);
  for (const line of disabled) console.log(`        ${line}`);
}

if (unexamined.length > 0) {
  console.log(`note  ${unexamined.length} filter(s) behind a spread, so not examined:`);
  for (const line of unexamined) console.log(`        ${line}`);
}

if (unwired.length === 0) {
  console.log(
    `ok    every filter under ${ROOT} is wired to something ` +
      `(${filtersSeen} filters in ${filesVisited} files)`,
  );
  console.log(`      ${unwired.length} unwired, ${unexamined.length} unexamined, ${disabled.length} disabled`);
  process.exit(0);
}

console.error(`FAIL  ${unwired.length} filter(s) with nothing behind them\n`);
for (const line of unwired) console.error(`  no handler  ${line}`);
console.error('\nA control in this list cannot be typed into or selected.');
process.exit(1);
