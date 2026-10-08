import { expect, test, type Page } from '@playwright/test';

/**
 * First-run setup.
 *
 * The wizard is the first thing a new teacher sees after registering, and the
 * reason it exists is that an empty workspace answers none of the questions a
 * teacher actually has. These tests walk it the way a teacher would and assert
 * the parts that are easy to get subtly wrong: that it saves as it goes, that
 * skipping works, that it is idempotent, and that a student is never shown it.
 */

const PASSWORD = 'LikoDemo!2026';

/** Registration leaves a session behind, so each test needs its own account. */
let counter = 0;
const uniqueEmail = () => `wizard-${Date.now()}-${(counter += 1)}@liko.test`;

async function register(page: Page): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/Full name/).fill('Wanda Fitzgerald');
  await page.getByLabel(/^Email/).fill(uniqueEmail());
  await page.getByLabel(/Password/).fill(PASSWORD);
  // Signup is gated on accepting the terms and the privacy notice. Every test
  // that reaches the wizard has to agree first, because there is no route into
  // the product that does not.
  await page.getByLabel(/I agree to the Terms of Use/).check();
  await page.getByLabel(/I have read the Privacy Notice/).check();
  await page.getByRole('button', { name: /Create workspace/i }).click();
  await expect(page).toHaveURL(/\/welcome/);
}

test.describe('the three questions', () => {
  test('walks from teaching context to a created class', async ({ page }) => {
    await register(page);

    // Step 1: what do you teach.
    await page.getByLabel('School or institution').fill('Ravensmoor College');
    await page.getByLabel('Subjects').fill('Physics, AP Physics');
    await page.getByLabel('Level you usually teach').selectOption('k12');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: how do you grade. Each scale says what it actually awards, so a
    // teacher picks by reading rather than by recognising an abbreviation.
    await expect(page.getByRole('heading', { name: 'How do you grade?' })).toBeVisible();

    // The five systems the product ships with, asserted by name. A count tied to
    // the whole list would pass or fail on how many custom scales happened to
    // exist in the fixture workspace when the suite ran.
    for (const scale of ['Percentage', 'Letter', 'Milestone', 'GPA', 'GWA']) {
      await expect(page.getByText(scale, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('radio')).toHaveCount(5);

    // The demo organisation's own scales are not this teacher's to see.
    await expect(page.getByText('UK degree class')).toHaveCount(0);

    await page.getByText('GWA', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: the first class, which inherits the scale just chosen.
    await expect(page.getByRole('heading', { name: 'Your first class' })).toBeVisible();
    await expect(page.getByText(/graded as GWA/i)).toBeVisible();

    await page.getByLabel('Class name').fill('Physics, Period 1');
    await page.getByLabel('Short code').fill('PHY-1');
    await page.getByRole('button', { name: 'Create class and finish' }).click();

    await expect(page).toHaveURL(/\/overview/);
  });

  test('the scale the teacher chose is the class scale', async ({ page }) => {
    await register(page);

    await page.getByLabel('Subjects').fill('Chemistry');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('GPA', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Class name').fill('Chemistry, Period 3');
    await page.getByLabel('Short code').fill('CHEM-3');
    await page.getByRole('button', { name: 'Create class and finish' }).click();
    await expect(page).toHaveURL(/\/overview/);

    // The choice has to survive the trip to the gradebook, or a GWA transcript
    // quietly comes out as a percentage one.
    await page.goto('/grades');
    await expect(page.getByLabel('Show as')).toHaveValue('gpa');
  });

  test('progress is saved as it goes, so closing the tab loses nothing', async ({
    page,
  }) => {
    await register(page);

    await page.getByLabel('School or institution').fill('Ravensmoor College');
    await page.getByLabel('Subjects').fill('Biology, Marine Science');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How do you grade?' })).toBeVisible();

    // Abandoned mid-wizard, then returned to by URL.
    await page.goto('/welcome');

    await expect(page.getByRole('heading', { name: 'How do you grade?' })).toBeVisible();

    // And the answers survived the reload.
    await page.goto('/settings/profile');
    await expect(page.getByLabel('School or institution')).toHaveValue('Ravensmoor College');
    await expect(page.getByLabel('Subjects')).toHaveValue('Biology, Marine Science');
  });

  test('the name typed at registration is not overwritten', async ({ page }) => {
    await register(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Class name').fill('Physics, Period 1');
    await page.getByLabel('Short code').fill('PHY-1');
    await page.getByRole('button', { name: 'Create class and finish' }).click();
    await expect(page).toHaveURL(/\/overview/);

    // The onboarding step does not ask for a name, so it must not invent one
    // from the email address either.
    await page.goto('/settings/profile');
    await expect(page.getByLabel('Full name')).toHaveValue('Wanda Fitzgerald');
  });

  test('a duplicate class code is refused with a reason', async ({ page }) => {
    await register(page);

    // Skipping is the fastest route to a second create, and the guard belongs to
    // the class code rather than to the wizard.
    await page.getByRole('link', { name: /Skip for now/i }).click();
    await expect(page).toHaveURL(/\/overview/);

    await page.goto('/classes');

    const create = async (name: string, code: string) => {
      await page.getByRole('button', { name: 'New class' }).click();
      await page.getByLabel('Class name').fill(name);
      await page.getByLabel('Short code').fill(code);
      await page.getByRole('button', { name: 'Create class' }).click();
    };

    await create('Physics, Period 1', 'PHY-1');
    await expect(page.getByRole('button', { name: /PHY-1/ })).toBeVisible();

    await create('Another Physics', 'PHY-1');
    await expect(page.getByText('PHY-1 is already in use.')).toBeVisible();
  });

  test('an empty class is refused before it is sent', async ({ page }) => {
    await register(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Create class and finish' }).click();

    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'Your first class' })).toBeVisible();
  });
});

test.describe('skipping', () => {
  test('the skip link reaches the workspace', async ({ page }) => {
    await register(page);

    await page.getByRole('link', { name: /Skip for now/i }).click();

    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator('#workspace-main')).toBeVisible();
  });

  test('a teacher who already has a class is sent straight on', async ({ page }) => {
    // The demo account is fully set up, so the wizard has nothing to ask.
    await page.goto('/login');
    await page.getByLabel('Email').fill('maya@liko.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });

    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/overview/);
  });

  test('a student is never shown the wizard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('student@liko.test');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });

    // There is no class to name and no scale to choose for a student, so the
    // route would be three questions with no answer available.
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/classes/);
  });
});