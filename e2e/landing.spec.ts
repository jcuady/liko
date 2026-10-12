import { expect, test } from '@playwright/test';

/**
 * Landing page acceptance criteria that are only observable in a real browser:
 * the page renders, the CTAs resolve, and nothing overflows horizontally.
 */

test.describe('landing page', () => {
  test('renders the hero value proposition above the fold', async ({ page }) => {
    await page.goto('/');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Less admin.');
    await expect(h1).toContainText('More teaching.');

    const cta = page.getByRole('link', { name: 'Try Liko free' }).first();
    await expect(cta).toBeVisible();
  });

  test('has exactly one h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('has no heading level skips', async ({ page }) => {
    await page.goto('/');

    const levels = await page
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.tagName[1])));

    let previous = 0;
    for (const level of levels) {
      // A jump of more than one level breaks screen reader navigation.
      if (previous !== 0) expect(level).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });

  test('the workspace mock is not a picture of headings', async ({ page }) => {
    /*
     * The mock's titles are drawn in the display face and read exactly like
     * headings, which is how three of them became real `h3`s sitting directly
     * under the page `h1`. That is a heading skip, and the check above catches
     * the symptom rather than the cause. This one asserts the cause: the
     * picture contributes no headings at all to the document outline.
     */
    await page.goto('/');

    const outline = await page
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));

    const mockCopy = ['A good day to make a difference.', 'See the student behind the score.'];
    for (const phrase of mockCopy) {
      expect(outline, `${phrase} must not be a heading on the page`).not.toContain(phrase);
    }
  });

  test('the primary CTA routes to registration', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Try Liko free' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('the hero CTA routes to registration', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: /Start teaching with Liko/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('every in-page anchor resolves to a real section', async ({ page }) => {
    await page.goto('/');

    /*
     * Both spellings, not just the bare one. `a[href^="#"]` matches only
     * `#features`, and the footer deliberately writes `/#features` so the same
     * footer works from `/pricing` and the legal pages. That deliberate change
     * moved every footer anchor outside this selector, which is how three dead
     * footer links (`/#flow`, `/#modules`, `/#proof`) reached production while
     * this test stayed green through every run. A check scoped to the syntax it
     * was written for stops covering the links the moment someone fixes them a
     * different way.
     *
     * On `/`, a `/#anchor` resolves against this same page, so both forms are
     * reduced to a fragment and looked up here.
     */
    const anchors = await page
      .locator('a[href^="#"], a[href^="/#"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute('href') ?? '')
          .filter((href) => href.length > 1),
      );

    const fragments = new Set(anchors.map((href) => href.replace(/^\//, '')));

    expect(fragments.size).toBeGreaterThan(0);

    for (const fragment of fragments) {
      await expect(page.locator(fragment), `${fragment} should resolve`).toHaveCount(1);
    }
  });

  test.describe('no horizontal scroll', () => {
    const widths = [320, 375, 768, 1024, 1440, 1920];

    for (const width of widths) {
      test(`at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  });

  test.describe('nothing important is clipped', () => {
    /*
     * "No horizontal scroll" is not the same question as "nothing is cut off",
     * and only one of the two was being asked. `.hero` carries
     * `overflow:hidden`, so two call-to-action buttons that together are wider
     * than a 390px phone were clipped at the panel edge while the document
     * reported zero overflow at every width. The scroll check could never see
     * it: the clipping happened inside a box that is not allowed to scroll.
     *
     * This asks the other question, of the elements that matter. Decorative
     * overhang is exempt, because the design deliberately pushes the floating
     * labels outside their container on a wide screen.
     */
    const widths = [320, 375, 768];

    for (const width of widths) {
      test(`primary calls to action stay inside the viewport at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const clipped = await page.evaluate((vw) => {
          const names = [
            'Start teaching with Liko',
            'See Liko in action',
            'Try Liko free',
            'Get started for free',
          ];
          const bad: string[] = [];
          for (const el of Array.from(document.querySelectorAll('a, button'))) {
            const text = (el.textContent ?? '').trim();
            if (!names.some((n) => text.includes(n))) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            // 1px of tolerance for subpixel rounding at fractional widths.
            if (r.left < -1 || r.right > vw + 1) {
              bad.push(`${text.slice(0, 30)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
            }
          }
          return bad;
        }, width);

        expect(clipped, `clipped at ${width}px`).toEqual([]);
      });
    }
  });

  test('the FAQ answers the money question, and says no card is taken', async ({ page }) => {
    await page.goto('/#faq');
    // Wait for hydration before clicking. The accordion is server-rendered, so
    // the button is visible and readable long before it can respond, and a click
    // that lands pre-hydration opens nothing at all. Under a loaded parallel run
    // that is the difference between this test passing and failing on how busy
    // the machine was, which is the one property a test must not have.
    await page.waitForLoadState('networkidle');

    const money = page.getByRole('button', { name: /credit card/i }).first();
    await expect(money).toBeVisible();
    await money.click();

    /*
     * It used to open with "What does the free trial include?" There is no
     * trial, so the first question a teacher saw was about a product that does
     * not exist. The answer has to say the thing that is true.
     */
    const panel = page.locator('#faq').getByRole('region').first();
    await expect(panel).toContainText('no card is taken');
  });

  test('the FAQ is honest about PowerPoint export', async ({ page }) => {
    /*
     * The supplied brand design answered this with "AI generation and
     * PowerPoint file export are not connected yet". Deck generation shipped and
     * works, so half of that sentence became false and would have undersold the
     * product. The other half is still true and deliberate:
     * `slides/actions.ts` refuses to import or export `.pptx`. This pins both
     * halves so neither drifts again.
     *
     * The question is now the design's own wording, "Can Liko create PowerPoint
     * presentations?", which asks the thing a visitor actually asks. The answer
     * is unchanged and still the one the code supports.
     */
    await page.goto('/#faq');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('button', { name: /Can Liko create PowerPoint presentations/i })
      .first()
      .click();

    const panel = page.locator('#faq').getByRole('region').first();
    await expect(panel).toContainText('no PowerPoint file export');
  });

  test('the FAQ says the students on the page are invented', async ({ page }) => {
    /*
     * Six Filipino names on a marketing page could be real children. The page
     * has to rule that out in its own words rather than relying on the visitor
     * to assume a demo.
     */
    await page.goto('/#faq');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Are the students on this page real/i }).first().click();

    const panel = page.locator('#faq').getByRole('region').first();
    await expect(panel).toContainText('six invented names');
  });

  test('the closing panel and the FAQ do not repeat the same sentence', async ({
    page,
  }) => {
    await page.goto('/#faq');
    await page.waitForLoadState('networkidle');

    /*
     * The answer has to be opened first. A Radix accordion keeps its content
     * out of the DOM until it is expanded, so reading the FAQ's copy off the
     * collapsed page times out waiting for text that is genuinely not there.
     */
    await page.getByRole('button', { name: /credit card/i }).first().click();

    const faqAnswer = await page
      .locator('#faq')
      .getByText(/no card is taken/i)
      .first()
      .innerText();
    const cta = await page.locator('#bottom-cta-title').locator('..').innerText();

    // Overlapping wording is fine; an identical sentence is copy duplication.
    expect(cta.includes(faqAnswer.trim())).toBe(false);
  });

  test('the skip link is the first focusable element', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/Skip to content/i);
  });

  test('every image has an alt attribute', async ({ page }) => {
    await page.goto('/');

    const images = await page
      .locator('img')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('alt')));

    for (const alt of images) expect(alt).not.toBeNull();
  });

  test('ships no emoji in visible copy', async ({ page }) => {
    await page.goto('/');

    // Only true pictographic emoji are flagged.
    //
    // U+2713 (check), U+2715 (cross) and U+2022 (bullet) are deliberately NOT
    // in these ranges: the attendance grid and the risk legend use them so that
    // state is carried by a glyph as well as a colour. Rejecting them would
    // force those components to rely on colour alone, which fails WCAG 1.4.1.
    const emoji = await page.evaluate(() => {
      const root = document.body;
      const pattern =
        /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
      const offenders: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        if (pattern.test(text)) offenders.push(text.slice(0, 80));
      }
      return offenders;
    });

    expect(emoji).toEqual([]);
  });

  test('the sample marks on the page are labelled as a sample', async ({ page }) => {
    /*
     * The workspace mock shows six Filipino names with percentages, and the
     * phone mock shows four more. Nothing distinguished them from real records
     * before. This replaced the attendance legend check, which only existed
     * because the old landing page embedded an attendance widget. The point is
     * unchanged: state has to be carried by something other than implication.
     */
    await page.goto('/');
    await expect(page.getByText(/Sample data, shown for illustration/i)).toBeVisible();
  });

  test('contains no em dash in visible copy', async ({ page }) => {
    await page.goto('/');

    const offenders = await page.evaluate(() => {
      const pattern = /\u2014|\u2013/;
      const found: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent ?? '';
        if (pattern.test(text)) found.push(text.slice(0, 100));
      }
      return found;
    });

    expect(offenders).toEqual([]);
  });
});