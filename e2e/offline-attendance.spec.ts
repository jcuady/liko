import { expect, test, type Page } from '@playwright/test';

/**
 * Taking a register with no signal.
 *
 * WHY THIS SPEC EXISTS. The attendance screen promises "works with no signal and
 * syncs when you reconnect", and the outbox that makes that true was for a while
 * dead code: nothing called `enqueueWrite`, so the queue was permanently empty,
 * an offline tap was dropped, and the "retry" affordance was decoration. It is
 * now wired to `POST /api/attendance`, an idempotent endpoint, and the online
 * path, the replay idempotency and the class ownership are proven against the
 * live database.
 *
 * WHAT WAS STILL NOT PROVEN. A genuinely offline capture replay. The status
 * document said so and pointed at a manual check, which is a way of saying the
 * behaviour was believed rather than demonstrated. It is demonstrable: a browser
 * can be put offline, a mark can be tapped, and the queue can be watched.
 *
 * THE ASSERTION THAT MATTERS IS THE LAST ONE. The optimistic mark lives in the
 * page, so a test that only looks at the screen proves the page is cheerful. A
 * RELOAD DISCARDS IT. So the mark being there after a reload can only mean the
 * write reached the server — and because the tap moves the mark one step round
 * the cycle, the status the server held before the test is not the status it
 * holds afterwards. If the replay never happened, the reload would show the
 * original status and this test would fail. That is the control, and it is
 * built into the assertion rather than asserted separately.
 */

/** The order a single tap walks a mark round. Copied from `AttendanceGrid`. */
const CYCLE = ['Present', 'Late', 'Absent', 'Excused', 'not set'] as const;

const PASSWORD = 'LikoDemo!2026';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

/**
 * The button that sets a student's mark.
 *
 * Its accessible name says who it is for and what the mark is now, which is
 * what makes it assertable without reaching into the component.
 */
function markCell(page: Page) {
  return page.locator('button[aria-label^="Set attendance for"]').first();
}

/** The banner that reports what is still on the device. */
function queuedBanner(page: Page) {
  return page.locator('[role="status"]').filter({ hasText: /queued on this device/i }).first();
}

/** What a cell says the mark is now. */
async function currentStatus(page: Page): Promise<string> {
  const label = await markCell(page).getAttribute('aria-label');
  const match = /Currently (.+)$/.exec(label ?? '');
  if (!match) throw new Error(`the cell did not say what its mark is: ${label}`);
  return match[1]!;
}

test.describe('offline attendance capture', () => {
  test('a mark taken with no signal is queued on the device and replays when the signal returns', async ({
    page,
    context,
  }) => {
    /*
     * A date nothing else in the suite writes to. The fixture workspace is one
     * shared mutable store and a register is keyed by class and day, so today's
     * date would collide with every other spec that takes a register.
     */
    const date = '2031-03-17';

    await signIn(page, 'maya@liko.test');
    await page.goto(`/attendance?date=${date}`);
    await page.waitForLoadState('networkidle');

    const mark = markCell(page);
    await expect(mark).toBeVisible();

    // Where this student starts. The seeded registers fill the last three weeks
    // and other days fall back to a default, so the starting value is read
    // rather than assumed.
    const before = await currentStatus(page);
    const after = CYCLE[(CYCLE.indexOf(before as (typeof CYCLE)[number]) + 1) % CYCLE.length]!;

    // --- the signal goes ---
    await context.setOffline(true);
    await mark.click();

    // The teacher is told two things, and both have to be true. The mark is on
    // screen, because they just made it. And it is ON THE DEVICE, because it has
    // not been sent — a banner that says "0 changes queued" while a change is
    // queued is worse than no banner, because it tells the teacher their tap did
    // not register.
    await expect(mark).toHaveAttribute('aria-label', new RegExp(`Currently ${after}$`));
    await expect(queuedBanner(page)).toBeVisible();
    await expect(queuedBanner(page)).toContainText(`Attendance for ${date}`);

    // --- and comes back ---
    await context.setOffline(false);
    /*
     * The browser can reload the page when the service worker regains control,
     * and a reload destroys the execution context mid-call. That is not a
     * nuisance to route around, it is a property to want: the queue has to
     * survive a reload, because a teacher who closes the tab on a train has to
     * come back to a register that is still waiting.
     *
     * So the reconnect is signalled repeatedly until the queue actually drains,
     * rather than signalled once and assumed to have landed.
     */
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => undefined);
      await expect(queuedBanner(page)).toHaveCount(0);
    }).toPass({ timeout: 30_000 });

    // --- and the only way this can be true is if it reached the server ---
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(markCell(page)).toHaveAttribute('aria-label', new RegExp(`Currently ${after}$`));
  });
});
