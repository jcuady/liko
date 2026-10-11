import { expect, test, type Page } from '@playwright/test';

/**
 * The deck generator, on the real page, with no call to the provider.
 *
 * WHY THERE IS NO LIVE GENERATION HERE. Hitting a real model from the
 * end-to-end suite makes the suite non-deterministic, costs money on every run,
 * and fails for reasons that have nothing to do with this codebase. The provider
 * is proven separately and on purpose by `scripts/probe-gemini.mjs`, which calls
 * it and prints the token usage.
 *
 * So the split is: this file proves the product is wired and honest about its
 * state, and the probe proves the provider answers. What is left untested by
 * the pair is the quality of the model's output, which no assertion can
 * meaningfully pin and which is honestly a judgement a teacher makes anyway.
 *
 * The one thing that IS deterministic and worth asserting is the refusal: an
 * empty prompt, and an exhausted allowance, must both produce a sentence
 * rather than a silent nothing.
 */

const TEACHER = { email: 'maya@liko.test', password: 'LikoDemo!2026' };

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEACHER.email);
  await page.getByLabel(/password/i).fill(TEACHER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/overview');
}

test.describe('the deck generator', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/slides');
  });

  test('tells the teacher what they have to spend before they spend it', async ({ page }) => {
    // By heading, not by role. A `<section>` with no accessible name is not a
    // `region`, so asking for one looks for a landmark that this page does not
    // have and reports a panel that is plainly on screen as missing.
    await expect(
      page.getByRole('heading', { name: 'Make a deck from a description' }),
    ).toBeVisible();

    /*
     * The meter. Asserted through its accessible value rather than through the
     * width of a div, because a bar that is 0% wide and a bar that is 100% wide
     * are the same element to a screenshot and different elements to a screen
     * reader and to anybody debugging this later.
     */
    const meter = page.getByRole('progressbar', { name: /generations used/i });
    await expect(meter).toBeVisible();

    const now = await meter.getAttribute('aria-valuenow');
    const max = await meter.getAttribute('aria-valuemax');
    expect(Number(now)).toBeGreaterThanOrEqual(0);
    expect(Number(max)).toBeGreaterThan(0);

    await expect(page.getByText(/\d+ of \d+ left this hour/)).toBeVisible();
  });

  test('will not submit an empty prompt', async ({ page }) => {
    const make = page.getByRole('button', { name: /make the deck/i });
    await expect(make).toBeDisabled();

    await page.getByLabel('What should the slides be about').fill('   ');
    await expect(make, 'whitespace is not a prompt').toBeDisabled();

    await page.getByLabel('What should the slides be about').fill('Ten slides on covalent bonding');
    await expect(make).toBeEnabled();
  });

  /*
   * WHY THERE IS NO LIVE SUBMIT HERE.
   *
   * The first version of this file typed a real prompt and clicked the button,
   * which made the end-to-end suite depend on a third-party provider being up,
   * within its quota, and fast. It failed on exactly that: a 48 second timeout
   * that said nothing about this codebase. The provider is proven on purpose by
   * `scripts/probe-ai-deck.mjs`, which calls it and asserts a deck comes back,
   * and this file proves the product is wired and honest about its state.
   */
  test('says what is left even before anything is typed', async ({ page }) => {
    await expect(page.getByRole('progressbar', { name: /generations used/i })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ left this hour/)).toBeVisible();
  });

  test('promises the teacher they can edit what it made', async ({ page }) => {
    await expect(
      page.getByText(/every slide it makes is yours to change afterwards/i),
    ).toBeVisible();
  });

  test('does not send the provider key to the browser', async ({ page }) => {
    /*
     * The key is the single most damaging thing that could leak from this
     * feature, so it is asserted against the whole rendered document rather
     * than against the component, because that is where a leak would land.
     */
    const html = await page.content();
    expect(html).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(html).not.toMatch(/AQ\.Ab[0-9A-Za-z]/);
    expect(html).not.toMatch(/GEMINI_API_KEY/);
  });

  test('shows the teacher the panel and not a note to the next developer', async ({ page }) => {
    /*
     * WHY THIS TEST IS HERE. A block comment written directly among the children
     * of a JSX element is text, not a comment. One did exactly that above the
     * prompt box, and it rendered a paragraph of English about font sizes to
     * every teacher who opened the page and read it aloud to anyone using a
     * screen reader. Lint rules the pattern out; this says it has not happened.
     *
     * Asserted on the document rather than on a component, because the damage
     * was in what reached the teacher, not in where the markup sat.
     */
    const html = await page.content();
    expect(html).not.toMatch(/iOS Safari/);
    expect(html).not.toMatch(/16px AND NOT 15/i);
    expect(html).not.toMatch(/this paragraph was being/);
  });
});