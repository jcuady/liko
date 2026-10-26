import { expect, test, type Page } from '@playwright/test';

/**
 * THE OUTBOX'S CONTRACT.
 *
 * The outbox is the thing that makes "works with no signal and syncs when you
 * reconnect" true, and on 2026-10-26 it was found to be making that promise
 * in three different ways at once. The e2e suite failed with a register
 * reading "not set" after a replay that had been reported as done, and the
 * trace of that run is what found the causes:
 *
 *   1. A QUEUE THAT COULD NOT BE READ WAS REPORTED AS AN EMPTY QUEUE. The
 *      banner renders nothing when the count is zero, so a storage error
 *      looked exactly like a teacher with nothing waiting, and a wait on the
 *      banner was satisfied by the error rather than by the queue emptying.
 *   2. A PAGE THAT LOADED WITH A QUEUED WRITE DID NOT SEND IT. The only
 *      things that started a flush were an `online` event and a thirty second
 *      poll, and a page that loaded AFTER the signal came back has already
 *      missed the event.
 *   3. A SEND THAT FAILED WAS NOT TRIED AGAIN SOON. The first attempt after a
 *      signal returns is the one that fails while the network is still
 *      settling, and the queue's next attempt was half a minute away.
 *
 * Each test below is one of those claims. They are about the product, not
 * about the implementation: what a teacher is told, and when a register
 * actually arrives.
 *
 * THE SERVICE WORKER IS BLOCKED IN THIS FILE. The worker claims pages in the
 * middle of a session and the page reloads when it does, which makes the
 * timing of every one of these tests depend on when the worker finished
 * installing. Nothing here is about the worker.
 */
test.use({ serviceWorkers: 'block' });

const PASSWORD = 'LikoDemo!2026';
const DATE = '2031-03-17';

/** The banner that reports the queue's state. */
function banner(page: Page) {
  return page.locator('[data-slot="offline-banner"]');
}

/** The button that sets a student's mark. */
function markCell(page: Page) {
  return page.locator('button[aria-label^="Set attendance for"]').first();
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@liko.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(overview|classes)/, { timeout: 30_000 });
}

/**
 * Makes every attempt to open the database fail.
 *
 * `idb` waits on the open request's `success` and `error` events, so the
 * stand-in has to be a request rather than a thrown error, and it has to fail
 * asynchronously the way a real one does.
 */
async function breakStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fail = (): IDBOpenDBRequest => {
      const listeners = new Map<string, EventListener[]>();
      const request = {
        result: null,
        error: new DOMException('storage is unavailable', 'UnknownError'),
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        onblocked: null,
        addEventListener(type: string, handler: EventListener) {
          listeners.set(type, [...(listeners.get(type) ?? []), handler]);
        },
        removeEventListener(type: string, handler: EventListener) {
          listeners.set(type, (listeners.get(type) ?? []).filter((h) => h !== handler));
        },
        dispatchEvent(event: Event) {
          for (const handler of listeners.get(event.type) ?? []) handler(event);
          return true;
        },
      };
      setTimeout(() => {
        for (const handler of listeners.get('error') ?? []) {
          handler({ type: 'error', target: request } as unknown as Event);
        }
      }, 0);
      return request as unknown as IDBOpenDBRequest;
    };
    indexedDB.open = fail;
  });
}

test.describe('the offline queue tells the truth', () => {
  test('the banner says it cannot check the queue rather than reporting nothing pending', async ({
    page,
  }) => {
    await breakStorage(page);

    await signIn(page);
    await page.goto(`/attendance?date=${DATE}`);
    await page.waitForLoadState('networkidle');

    /*
     * THE CLAIM. The banner is on screen, and it does not say that nothing is
     * waiting.
     *
     * A banner that is ABSENT is the failure, because absence is exactly how
     * the old code reported an unreadable queue: the count came back as zero
     * and the component rendered nothing.
     */
    const notice = banner(page);
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText(/0 changes? queued/i);

    /*
     * AND IT SAYS WHAT IT DOES NOT KNOW, in words a teacher can act on.
     */
    await expect(notice).toContainText(/cannot check/i);
  });
});

test.describe('the offline queue sends what it holds', () => {
  test('a page that loads with a queued write sends it without waiting for a network event', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/attendance?date=${DATE}`);
    await page.waitForLoadState('networkidle');

    /*
     * EVERY ATTEMPT IS REFUSED, so the write cannot leave the queue.
     */
    let attempts = 0;
    await page.route('**/api/attendance', async (route) => {
      attempts += 1;
      await route.abort('failed');
    });

    await markCell(page).click();
    /*
     * THE TEACHER IS TOLD WHAT IS WAITING.
     *
     * The device is online here, so the banner uses its online wording and
     * names the write rather than counting it.
     */
    await expect(banner(page)).toContainText(`Attendance for ${DATE}`);

    const before = attempts;
    expect(before).toBeGreaterThan(0);

    /*
     * THE PAGE RELOADS, AND THE QUEUE IS STILL THERE.
     *
     * A reload is the case that matters: the queue is durable, so the write
     * survives it, and the page that comes back has to send it. The `online`
     * event has already been and gone by then, and the poll is half a minute
     * away, so without a flush on load the register would sit there.
     */
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect.poll(() => attempts, { timeout: 15_000 }).toBeGreaterThan(before);
  });

  test('a send that fails is tried again rather than left for half a minute', async ({ page }) => {
    await signIn(page);
    await page.goto(`/attendance?date=${DATE}`);
    await page.waitForLoadState('networkidle');

    /*
     * THE FIRST TWO ATTEMPTS ARE REFUSED AND THE THIRD IS ALLOWED THROUGH.
     *
     * Two, not one, and the second one is the point. The first attempt is the
     * one the teacher caused. The second is the one the queue makes on its own
     * straight afterwards. The third is the one only a RETRY LADDER can
     * produce, because the second failed too and the next poll is half a
     * minute away.
     */
    let attempts = 0;
    await page.route('**/api/attendance', async (route) => {
      attempts += 1;
      if (attempts <= 2) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    const accepted = page.waitForResponse(
      (response) => response.url().includes('/api/attendance') && response.status() === 200,
      { timeout: 20_000 },
    );

    await markCell(page).click();

    /*
     * THE WRITE IS TRIED AGAIN, AND A LATER ATTEMPT LANDS.
     *
     * The first attempt failed for the reason a first attempt after a signal
     * comes back fails: the network was not ready. The queue has to try again
     * while the teacher is still looking at the register, not half a minute
     * later.
     */
    await accepted;
    expect(attempts).toBeGreaterThanOrEqual(3);
  });
});
