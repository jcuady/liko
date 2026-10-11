import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Page titles must not end in a full stop.
 *
 * WHY THIS IS A FILE SCAN AND NOT A RENDERED ASSERTION.
 *
 * The root layout sets `title.template` to `'%s. LIKO'`, so Next substitutes a
 * page's own title into it and appends the brand. A page title that already
 * ends in a period therefore renders as "Less admin. More teaching.. LIKO", in
 * the browser tab and in every search result for the page.
 *
 * The previous landing title was "Every teaching task, in one flow." and had
 * been producing a doubled full stop in production for as long as it existed.
 * Nothing caught it, because every test that looked at the title asserted on
 * something else, and reading it meant visiting the deployed site and looking
 * at the tab.
 *
 * A scan of the source is enough and costs nothing: the defect is a character
 * sitting in a string literal, before any rendering happens.
 */

const APP_DIR = join('src', 'app');
const TEMPLATE_HOLDER = join(APP_DIR, 'layout.tsx');

/**
 * Every page.tsx under src/app, and nothing else.
 *
 * Only a page's own `title:` goes through the layout template. A component with
 * a `title` field in its data, such as a feature card's heading, is not a
 * document title and keeps whatever punctuation it likes. Scanning every .tsx
 * caught exactly those and produced three false positives on the first run,
 * which is the usual fate of a source scan written by pattern rather than by
 * knowing what the thing is.
 */
function pageSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...pageSources(path));
    } else if (entry === 'page.tsx') {
      found.push(path);
    }
  }
  return found;
}

describe('page metadata', () => {
  it('the title template appends the brand', () => {
    const layout = readFileSync(TEMPLATE_HOLDER, 'utf8');
    expect(layout).toMatch(/template:\s*'%s\. LIKO'/);
  });

  it('no page title ends in a full stop', () => {
    const offenders: string[] = [];

    for (const path of pageSources(APP_DIR)) {
      // A layout's title is the template itself and is absolute, so a period
      // in it is correct rather than doubled. Only pages are scanned anyway.
      if (path === TEMPLATE_HOLDER) continue;

      const source = readFileSync(path, 'utf8');
      // Only the `title:` inside a metadata object, never a component's own
      // title prop, which is not a document title and has its own punctuation.
      for (const match of source.matchAll(/^\s{4}title:\s*'([^']+)'/gm)) {
        if (match[1].trimEnd().endsWith('.')) {
          offenders.push(`${path}: "${match[1]}"`);
        }
      }
    }

    expect(offenders, 'these titles render with a doubled full stop').toEqual([]);
  });
});