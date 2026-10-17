import { expect, test, type Page } from '@playwright/test';

/**
 * Responsive regressions.
 *
 * WHY THIS FILE EXISTS. Three real defects were found by measuring the built app
 * at seven widths rather than by reading the CSS, and none of them would have
 * been caught by a screenshot:
 *
 * * `/classes` scrolled sideways by 56px on a 375px screen. A grid item defaults
 *   to `min-width: auto`, so the class list refused to shrink below a code badge
 *   set in `whitespace-nowrap`, and the single-column track grew to fit it.
 * * `/admin` scrolled sideways by 20px. Four tab triggers in an `inline-flex`
 *   that cannot wrap pushed the page out, because the overflow belonged inside
 *   the strip and not on the document.
 * * Every `sm` button, every slide-rail icon button and the theme switch were
 *   under the 44px comfortable target on a phone, because a 36px control is
 *   right for a mouse and wrong for a thumb.
 *
 * Each of those is a one-line fix that is very easy to undo by accident, so the
 * measurement is kept as a test rather than left as a note.
 */

const PASSWORD = 'LikoDemo!2026';

const ROUTES = [
  '/overview',
  '/classes',
  '/attendance',
  '/plan',
  '/slides',
  '/grades',
  '/assess',
  '/history',
  '/settings/profile',
  '/settings/appearance',
  '/settings/notifications',
  '/admin',
];

/** Every width in the matrix where a phone, a tablet or a desktop is plausible. */
const WIDTHS = [375, 393, 430, 768, 1024, 1280, 1920];

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('dev@liko.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/overview/, { timeout: 30_000 });
}

test.describe('no page scrolls sideways', () => {
  for (const width of WIDTHS) {
    test(`nothing overflows at ${width}px`, async ({ page }) => {
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });

      const overflowing: string[] = [];

      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          if (doc.scrollWidth <= doc.clientWidth + 1) return null;

          // Name the outermost offender so a failure says which element broke.
          for (const el of document.querySelectorAll('body *')) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (getComputedStyle(el).position === 'fixed') continue;
            if (rect.right <= doc.clientWidth + 1) continue;
            if ([...el.children].some((c) => c.getBoundingClientRect().right > doc.clientWidth + 1)) {
              continue;
            }
            return `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`;
          }
          return 'unknown';
        });

        if (report) overflowing.push(`${route} -> ${report}`);
      }

      expect(overflowing, `horizontal overflow at ${width}px`).toEqual([]);
    });
  }
});

test.describe('things a finger can hit', () => {
  /*
   * Phones and tablets only. A 36px button is a deliberate density choice on a
   * desktop, where the pointer is precise and the screen is wide.
   */
  for (const width of [375, 393, 430, 768]) {
    test(`every control is at least 44px at ${width}px`, async ({ page }) => {
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });

      const small: string[] = [];

      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const offenders = await page.evaluate(() => {
          const rows: string[] = [];
          const selector =
            'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch]';

          for (const el of document.querySelectorAll(selector)) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            // A skip link that is 1x1 until focused is the correct pattern, and
            // an sr-only label is not a target.
            if (style.clip === 'rect(0px, 0px, 0px, 0px)') continue;
            if (el.closest('[hidden]')) continue;

            if (rect.width < 44 || rect.height < 44) {
              const label =
                el.getAttribute('aria-label') || el.textContent || el.getAttribute('id') || el.tagName;
              rows.push(
                `${el.tagName.toLowerCase()} "${label.trim().slice(0, 32)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
              );
            }
          }
          return rows;
        });

        for (const row of offenders) small.push(`${route} -> ${row}`);
      }

      expect(small, `controls under 44px at ${width}px`).toEqual([]);
    });
  }
});

test.describe('focusing a field does not zoom an iPhone', () => {
  /*
   * iOS Safari zooms the viewport when a field's font is under 16px, and the
   * user has to pinch back out. The type scale is 15px by design, so inputs
   * step up on touch widths and step back down from `lg`.
   */
  const width = 393;

  test('every text field is at least 16px on a phone', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width, height: 900 });

    const small: string[] = [];

    for (const route of ['/settings/profile', '/classes', '/welcome', '/slides']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const sizes = await page.evaluate(() => {
        const rows: string[] = [];
        for (const el of document.querySelectorAll('input, textarea, select')) {
          if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 16) rows.push(`${el.tagName.toLowerCase()} ${size}px`);
        }
        return rows;
      });

      for (const row of sizes) small.push(`${route} -> ${row}`);
    }

    expect(small, `fields under 16px at ${width}px`).toEqual([]);
  });

  test('the type scale returns to its own size on a desktop', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/settings/profile');
    const size = await page
      .getByLabel('Full name')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    // 15px is the design system's reading size. It is only wrong on a phone,
    // and only because of the zoom.
    expect(size).toBeLessThan(16);
  });
});

/*
 * THE AUTH PAGES, WHICH EVERY SINGLE PERSON MEETS FIRST AND WHICH NEITHER SWEEP
 * ABOVE HAD EVER LOOKED AT.
 *
 * Both sweeps above sign in before they measure, which is correct for the
 * workspace and wrong for these two: `/login` and `/register` redirect a signed-in
 * visitor, so adding them to `ROUTES` would have measured the redirect target and
 * reported a clean result for a page nobody visited. The consequence was a whole
 * shell that ships unmeasured, on the one screen every user sees before they have
 * an account to sign in with.
 *
 * Anonymous, and at the phone widths, because that is where the thumb is.
 */
test.describe('the auth pages hold up on a phone', () => {
  const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

  for (const width of [375, 393]) {
    test(`no control on the auth pages is under 44px at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      const small: string[] = [];

      for (const route of AUTH_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const offenders = await page.evaluate(() => {
          const rows: string[] = [];
          const selector =
            'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox]';

          /*
           * MEASURE THE TARGET A THUMB ACTUALLY HITS, NOT THE PAINTED BOX.
           *
           * Two corrections the first version of this sweep needed, both found by
           * running it rather than by reading the markup:
           *
           * A checkbox inside a `<label>` is hit through the label. `Checkbox` in
           * `components/ui/checkbox.tsx` is deliberately a 20px box inside a 44px
           * span, because a 20px box next to 15px body type is the right shape for
           * a checkbox and the wrong shape for a thumb. Measuring the input
           * reported a defect that was not one. Same for the role radios, whose
           * labels carry `min-h-11`.
           *
           * And a link inside a sentence is exempt under WCAG 2.5.8, which
           * excludes targets inline in a block of text. "Terms of Use" is 20px
           * tall and always will be; widening it would break the line it sits in.
           * The test is what decides, so the exemption has to be in the test.
           */
          for (const el of document.querySelectorAll(selector)) {
            // Inline-in-a-sentence, before anything is measured.
            if (el.tagName === 'A') {
              const parent = el.parentElement;
              // The parent has to be a text-flow element. Testing "does the parent
              // contain other text" alone exempted the logo link, because its
              // parent is the whole page column and the column contains the form.
              const TEXT_PARENTS = ['P', 'LI', 'DD', 'DT', 'LABEL', 'SPAN', 'STRONG', 'B', 'EM'];
              const around =
                parent && TEXT_PARENTS.includes(parent.tagName)
                  ? (parent.textContent ?? '').replace(el.textContent ?? '', '').trim()
                  : '';
              if (around.length > 0) continue;
            }

            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            if (style.clip === 'rect(0px, 0px, 0px, 0px)') continue;
            if (el.closest('[hidden]')) continue;

            /*
             * The label is the target ONLY when it wraps the control.
             *
             * `FormField` uses `<label htmlFor>` as a *caption* beside the input,
             * not a wrapper, and that caption is a 14px line of text. Resolving a
             * target through it reported every field on every auth page as a
             * 345x23 offender when the input beside it is `h-11`. A label that
             * does not wrap the control is not what a thumb hits.
             */
            const label = el.closest('label');
            const box = (label ?? el).getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (box.width === 0 || box.height === 0) continue;

            if (box.width < 44 || box.height < 44) {
              const label_ =
                el.getAttribute('aria-label') ||
                el.textContent ||
                el.getAttribute('name') ||
                el.tagName;
              rows.push(
                `${el.tagName.toLowerCase()}[${(el as HTMLInputElement).type ?? ''}] "${label_.trim().slice(0, 32)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
              );
            }
          }
          return rows;
        });

        for (const row of offenders) small.push(`${route} -> ${row}`);
      }

      expect(small, `auth controls under 44px at ${width}px`).toEqual([]);
    });

    test(`no auth field zooms an iPhone at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      const small: string[] = [];

      for (const route of AUTH_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        const sizes = await page.evaluate(() => {
          const rows: string[] = [];
          for (const el of document.querySelectorAll('input, textarea, select')) {
            if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size < 16) rows.push(`${el.getAttribute('name') ?? el.tagName} ${size}px`);
          }
          return rows;
        });

        for (const row of sizes) small.push(`${route} -> ${row}`);
      }

      expect(small, `auth fields under 16px at ${width}px`).toEqual([]);
    });
  }
});

test.describe('navigation survives the narrowest screen', () => {
  test('the tab bar offers every destination behind More', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 667 });

    const tabBar = page.locator('nav[aria-label="Workspace"]').last();

    // Five tabs plus More, and not a sixth squeezed in. Six icons across 375px
    // is about 62px each, under the comfortable target once labels are counted.
    await expect(tabBar.locator('a, button')).toHaveCount(6);

    // The first five destinations are the ones a teacher opens every day.
    for (const destination of ['Overview', 'Classes', 'Attendance', 'Planner', 'Slides']) {
      await expect(tabBar.getByRole('link', { name: destination })).toBeVisible();
    }

    await page.getByRole('button', { name: 'More destinations' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    /*
     * Everything that did not fit has to be reachable behind More, or the
     * narrowest screen has quietly lost routes. That includes Administration,
     * which is admin-only and so proves the sheet is filtered by role too.
     */
    for (const destination of ['Gradebook', 'Assess', 'History', 'Profile', 'Administration']) {
      await expect(sheet.getByRole('link', { name: destination })).toBeVisible();
    }
  });
});