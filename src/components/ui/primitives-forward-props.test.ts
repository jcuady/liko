import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Do the shared primitives actually forward what a caller gives them?
 *
 * WHY THIS EXISTS. `verify:filters` reports three filters as "behind a spread,
 * so not examined": `Input`, `Textarea` and `Checkbox`. Those are the shadcn
 * primitives, and a spread there is the design rather than a risk, because a
 * primitive exists precisely to forward. But "it is a primitive, so it is fine"
 * is the same unexamined claim wearing a better hat, and if `Checkbox` ever
 * started pulling `onChange` out of `props` and dropping it, every consent box
 * in the product would silently stop working and this gate would keep reporting
 * it as merely unexamined.
 *
 * So the three are examined here, by reading the source, and the property
 * asserted is the one that actually matters:
 *
 *   A PRIMITIVE MAY CONSUME PRESENTATION. IT MAY NOT CONSUME A HANDLER.
 *
 * A handler name in the destructured list is a swallowed event. A presentation
 * name is the primitive doing its job.
 *
 * WHY IT PARSES RATHER THAN GREPS. `{...props}` is the thing being asserted, and
 * a regex cannot tell a spread on the native element from one on a wrapper, or
 * a live spread from the same three characters inside a comment.
 *
 * WHY IT READS SOURCE AND NOT THE DOM. These are React components; rendering
 * them needs a DOM and a renderer, and asserting that a component spreads props
 * by rendering it would be testing React. The question here is about this code.
 */

const UI = join('src', 'components', 'ui');

/** Names a primitive is allowed to take for itself. */
const PRESENTATION = new Set([
  'className',
  'type',
  'rows',
  'invalid',
  'defaultValue',
  'defaultChecked',
  'id',
  'name',
  'placeholder',
  'autoComplete',
]);

/**
 * Names that carry behaviour. A primitive that pulls one of these out of props
 * and never puts it on the element has swallowed it.
 */
const HANDLERS = new Set([
  'onChange',
  'onCheckedChange',
  'onClick',
  'onBlur',
  'onFocus',
  'onInput',
  'onSubmit',
  'onKeyDown',
  'onKeyUp',
  'onPointerDown',
]);

interface PrimitiveFacts {
  /** Names taken out of props by the component. */
  consumed: string[];
  /** Whether the rest are spread onto the rendered element. */
  spreadsOntoElement: boolean;
  /** The element the spread lands on. */
  element: string | null;
}

function readPrimitive(file: string, elementName: string): PrimitiveFacts {
  const path = join(UI, file);
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const consumed: string[] = [];
  let spreadsOntoElement = false;
  let element: string | null = null;
  let elementStart = -1;

  /*
   * Two components live in `input.tsx`, so a file-wide walk collected the
   * destructuring of both and reported `props` twice for whichever element was
   * being asked about. The functions are collected WITH THEIR RANGE and the one
   * that actually renders the element is picked out afterwards, innermost first.
   */
  const functions: { start: number; end: number; names: string[] }[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName?.getText() === elementName &&
      elementStart === -1
    ) {
      element = elementName;
      elementStart = node.getStart();
      spreadsOntoElement = node.attributes.properties.some(
        (prop) => prop.kind === ts.SyntaxKind.JsxSpreadAttribute,
      );
    }

    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parameters.length > 0) {
      const first = node.parameters[0];
      if (ts.isObjectBindingPattern(first.name)) {
        const names: string[] = [];
        for (const element of first.name.elements) {
          /*
           * `element.name` is the Identifier and the `...` is a separate
           * `dotDotDotToken` on the BindingElement, so testing the text for a
           * leading `...` never matches. That mistake made the rest element look
           * like a consumed prop named `props`, in every one of the three
           * primitives.
           */
          if (element.dotDotDotToken) continue;
          names.push(element.propertyName?.getText() ?? element.name.getText());
        }
        functions.push({ start: node.getStart(), end: node.getEnd(), names });
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  const owner = functions
    .filter((fn) => fn.start <= elementStart && fn.end >= elementStart)
    .sort((a, b) => b.start - a.start)[0];

  consumed.push(...(owner?.names ?? []));

  return { consumed, spreadsOntoElement, element };
}

describe('shared primitives forward what a caller gives them', () => {
  const cases: { file: string; element: string; component: string }[] = [
    { file: 'input.tsx', element: 'input', component: 'Input' },
    { file: 'input.tsx', element: 'textarea', component: 'Textarea' },
    { file: 'checkbox.tsx', element: 'input', component: 'Checkbox' },
  ];

  for (const { file, element, component } of cases) {
    describe(`${component} in ${file}`, () => {
      const facts = readPrimitive(file, element);

      it('renders the native element', () => {
        expect(facts.element).toBe(element);
      });

      it('spreads the remaining props onto it', () => {
        // Without this the primitive is a shell: it styles a control and drops
        // whatever the page tried to attach to it.
        expect(facts.spreadsOntoElement).toBe(true);
      });

      it('consumes only presentation props', () => {
        const swallowed = facts.consumed.filter((name) => HANDLERS.has(name));
        expect(swallowed).toEqual([]);
      });

      it('consumes names that are presentation, not arbitrary', () => {
        // A name that is neither presentation nor a handler is usually a typo,
        // and a typo here means a prop the page passes silently goes nowhere.
        const unknown = facts.consumed.filter(
          (name) => !PRESENTATION.has(name) && !HANDLERS.has(name),
        );
        expect(unknown).toEqual([]);
      });
    });
  }
});

describe('the handler list is a list, not a trap', () => {
  /*
   * A negative-case guard on this file's own instrument. Every assertion above
   * is a `not.toContain` shaped one, and a test that can only pass is worth
   * nothing. These three prove the sets actually discriminate: a handler is in
   * HANDLERS and not in PRESENTATION, presentation is the reverse, and a name
   * can be in neither.
   */
  it('separates handlers from presentation', () => {
    expect(HANDLERS.has('onChange')).toBe(true);
    expect(PRESENTATION.has('onChange')).toBe(false);
    expect(PRESENTATION.has('className')).toBe(true);
    expect(HANDLERS.has('className')).toBe(false);
  });

  it('does not silently accept an unknown name', () => {
    expect(PRESENTATION.has('onSomeFutureHandler')).toBe(false);
    expect(HANDLERS.has('someProp')).toBe(false);
  });
});