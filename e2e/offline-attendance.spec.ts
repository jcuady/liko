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
 *
 * WHAT WAS STILL NOT PROVEN, AND WHAT IT COST. This spec failed on 2026-10-26
 * with the register reading "not set" after a replay that had been reported as
 * done. The trace of that run is what found the real defect, and the real
 * defect was in the WAIT rather than in the write: the wait watched for the
 * banner to be absent, and the banner goes absent when the queue cannot be
 * READ as well as when the queue is empty. A failed read had been reported as
 * an empty queue, so the wait was satisfied by a storage error and the test
 * read a register the server had never been told about. The wait now watches
 * the server's answer instead, and the banner no longer lies when it cannot
 * read the queue.
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

/** The banner that reports what is still on the device, in its OFFLINE wording. */
function queuedBanner(page: Page) {
  return page.locator('[data-slot="offline-banner"]').filter({ hasText: /queued on this device/i }).first();
}

/**
 * THE BANNER, WHATEVER IT SAYS.
 *
 * THIS IS THE FIX, AND THE OLD WAIT WAS A WAIT THAT MEANT NOTHING.
 *
 * The old wait looked for the banner's OFFLINE wording and asserted it was
 * gone. But that wording disappears the moment the browser comes back online,
 * because the banner switches to "Syncing 1 queued change" — so the wait was
 * satisfied the instant the device reconnected, while the queue was still
 * full. The test then reloaded and read the register, and the reload's read
 * could be served BEFORE the replay's write had committed. When it was, the
 * teacher saw the original mark and the test failed with a message about
 * attendance rather than about a race.
 *
 * It passed on most runs because the replay is usually faster than the
 * reload, and it failed on the run where it was not. A wait that is satisfied
 * by the wrong event is not a slow test, it is a test that measures nothing.
 *
 * The banner is the outbox's own view of the queue, and it is on screen
 * exactly when the device is offline OR something is still to send. So
 * "the banner is gone" is the one condition that means "the queue is empty and
 * the device is back", which is the thing the replay has to have happened for.
 */
function outboxBanner(page: Page) {
  return page.locator('[data-slot="offline-banner"]');
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
    /*
     * THE LISTENER IS REGISTERED BEFORE THE SIGNAL COMES BACK.
     *
     * The browser fires its own `online` event the moment it reconnects, and
     * the replay can be finished before the next line of this test is reached.
     * A listener set up afterwards would miss the one response that matters.
     */
    const replayed = page.waitForResponse(
      (response) => response.url().includes('/api/attendance') && response.status() === 200,
      { timeout: 30_000 },
    );

    await context.setOffline(false);
    /*
     * The browser can reload the page when the service worker regains control,
     * and a reload destroys the execution context mid-call. That is not a
     * nuisance to route around, it is a property to want: the queue has to
     * survive a reload, because a teacher who closes the tab on a train has to
     * come back to a register that is still waiting.
     *
     * So the reconnect is signalled as well as waited for, rather than
     * signalled once and assumed to have landed.
     */
    await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => undefined);

    /*
     * THE WAIT THAT MEANS WHAT IT SAYS.
     *
     * The old wait watched for the banner to be ABSENT. That is satisfied by
     * three different things: the queue emptied, the queue could not be read,
     * and the banner was not on the page at all. Only the first of them means
     * the write was sent, and on 2026-10-26 the second of them is what
     * happened. The banner was gone because a failed read had been reported as
     * an empty queue, the test read the register, and the mark was not there
     * because the server had never been told about it.
     *
     * So this waits for the thing the test is actually about: the server
     * answering the replayed write. The route commits the mark before it
     * answers, so a 200 means the register holds the mark, and the reload
     * below can only read what the server has.
     */
    await replayed.then(
      () => undefined,
      () => {
        throw new Error(
          'the queued mark never reached the server: /api/attendance did not answer 200 after the signal returned',
        );
      },
    );

    // With the queue empty, the banner has nothing left to report.
    await expect(outboxBanner(page)).toHaveCount(0);

    // --- and the only way this can be true is if it reached the server ---
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(markCell(page)).toHaveAttribute('aria-label', new RegExp(`Currently ${after}$`));
  });
});
