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
    await expect(h1).toHaveText(/Every teaching task/i);

    const cta = page.getByRole('link', { name: 'Start free' }).first();
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

  test('the primary CTA routes to registration', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Start free' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('the hero email capture carries the address into registration', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter your email here').fill('teacher@school.edu');
    await page.getByRole('button', { name: /Start free/i }).click();
    await expect(page).toHaveURL(/\/register\?email=teacher%40school\.edu/);
    await expect(page.getByLabel('Email')).toHaveValue('teacher@school.edu');
  });

  test('the hero email field rejects a malformed address', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter your email here').fill('not-an-email');
    await page.getByRole('button', { name: /Start free/i }).click();

    // Scoped to the field's own error, because Next renders a global
    // route-announcer element that also carries role="alert".
    await expect(page.locator('#hero-email-error')).toContainText('valid email');
    await expect(page).toHaveURL(/\/$/);
  });

  test('every in-page anchor resolves to a real section', async ({ page }) => {
    await page.goto('/');

    const anchors = await page.locator('a[href^="#"]').evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('href') ?? '')
        .filter((href) => href.length > 1),
    );

    for (const href of new Set(anchors)) {
      await expect(page.locator(href)).toHaveCount(1);
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

  test('the FAQ answers the cost question first, and says it is free', async ({ page }) => {
    await page.goto('/#faq');
    // Wait for hydration before clicking. The accordion is server-rendered, so
    // the button is visible and readable long before it can respond, and a click
    // that lands pre-hydration opens nothing at all. Under a loaded parallel run
    // that is the difference between this test passing and failing on how busy
    // the machine was, which is the one property a test must not have.
    await page.waitForLoadState('networkidle');

    const first = page.getByRole('button', { name: /what does it cost/i }).first();
    await expect(first).toBeVisible();
    await first.click();

    /*
     * It used to open with "What does the free trial include?" There is no
     * trial, so the first question a teacher sees was about a product that does
     * not exist. The panel now has to say the thing that is true.
     */
    const panel = page.locator('#faq').getByRole('region').first();
    await expect(panel).toContainText('Nothing right now');
    await expect(panel).toContainText('no card is taken');
  });

  test('the closing panel and the FAQ do not repeat the same sentence', async ({
    page,
  }) => {
    await page.goto('/');

    const faqAnswer = await page
      .locator('#faq')
      // Was "No credit card". The FAQ now says "no card is taken", because
      // there is no trial and therefore no credit-card question to answer.
      .getByText(/no card is taken/i)
      .first()
      .innerText();
    const cta = await page.locator('#final-cta-title').locator('..').innerText();

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

  test('attendance state is carried by a glyph, not colour alone', async ({
    page,
  }) => {
    await page.goto('/');

    // The legend text is the non-colour carrier for the attendance states.
    for (const label of ['Present', 'Absent', 'Late', 'Excused']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
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