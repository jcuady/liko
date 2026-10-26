'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * The offline write queue.
 *
 * `idb` has been a declared dependency since the project was scaffolded and was
 * never used, while the attendance screen promised "works with no signal and
 * syncs when you reconnect". This is that queue.
 *
 * WRITE-FIRST, THEN SEND
 * -----------------------
 * Every mutation is written to IndexedDB before it is attempted online, and
 * removed only after the server confirms it. The ordering matters: a
 * try-then-queue design loses the write in the window between the two steps,
 * which is exactly the window a flaky classroom connection lives in.
 *
 * WHY THIS AND NOT SERVICE-WORKER QUEUEING ALONE
 * Serwist's BackgroundSyncPlugin replays a request the browser failed to send.
 * That covers a dead connection, but it does not know whether the server
 * accepted the write, so it cannot show the teacher how many marks are still
 * pending. Holding the queue here means the same list can drive the UI.
 *
 * IDEMPOTENCY IS THE CONTRACT
 * Replaying is only safe because attendance upserts on (class_id, student_id,
 * date) and grades upsert on (assessment_id, student_id). Replaying the same
 * day twice updates a row rather than duplicating it. Any new write type must
 * carry its own uniqueness constraint or it must not be queued.
 */

export interface OutboxEntry {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  label: string;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

interface LikODB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { 'by-createdAt': number };
  };
}

const DB_NAME = 'liko';
const DB_VERSION = 1;
const STORE = 'outbox';

/** Dropped from the queue after this many failures, so one bad row is not forever. */
const MAX_ATTEMPTS = 12;

let dbPromise: Promise<IDBPDatabase<LikODB>> | null = null;

function getDb(): Promise<IDBPDatabase<LikODB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('outbox is browser only'));
  }
  if (!dbPromise) {
    const attempt = openDB<LikODB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
      },
    });
    dbPromise = attempt;

    /*
     * A FAILED OPEN MUST NOT POISON THE OUTBOX FOR THE LIFE OF THE PAGE.
     *
     * The promise was cached as it was, rejected and all, so every later read
     * and every later write failed with the same error and NOTHING EVER
     * RETRIED. One transient failure -- a quota, a database the browser had
     * evicted under pressure -- turned the whole queue off until the teacher
     * reloaded the page, and the symptom was a queue that claimed to be empty.
     *
     * So the failed promise is dropped and the next call opens the database
     * again. The rejection still reaches whoever asked for the connection; this
     * only makes the NEXT attempt possible.
     */
    attempt.catch(() => {
      if (dbPromise === attempt) dbPromise = null;
    });
  }
  return dbPromise;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Queues a write and attempts it immediately.
 *
 * Resolves with the server response on success. On a network failure the entry
 * is already durable, so the caller can carry on optimistically and the flush
 * loop will pick it up.
 */
export async function enqueueWrite(
  entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts' | 'lastError'>,
): Promise<Response | null> {
  const record: OutboxEntry = {
    ...entry,
    id: newId(),
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };

  try {
    await (await getDb()).put(STORE, record);
  } catch {
    // Storage unavailable (private mode, quota). Fall through and try the
    // network anyway: losing the queue is bad, losing the write is worse.
  }

  const response = await attempt(record);

  /*
   * AND THE FLUSH LOOP IS TOLD.
   *
   * A null response is a write that is durable and unsent, and that is the
   * one state the queue cannot be left in without trying. The teacher has been
   * told the mark is on the device; the device has to try to send it, and it
   * has to try again on its own if this attempt failed for the same reason
   * the next one will.
   */
  if (response === null) wake();

  return response;
}

async function attempt(record: OutboxEntry): Promise<Response | null> {
  try {
    const response = await fetch(record.path, {
      method: record.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record.body),
    });

    if (response.ok) {
      await remove(record.id);
      notify();
      return response;
    }

    /*
     * WHICH FAILURES ARE PERMANENT, AND WHY 429 IS NOT ONE OF THEM.
     *
     * A 4xx means the server refused the request on its merits, so replaying it
     * refuses it again and the queue would retry a dead row forever. That is
     * true of a 400, a 401 and a 404, and false of exactly two statuses.
     *
     * 429 says the caller is going too fast, and 503 says the server cannot
     * serve it right now. Both are "come back later", not "never", and this
     * queue is exactly the case they exist for: a teacher takes a register
     * offline, the tablet reconnects in a lift full of people, and every queued
     * write arrives at once. Treating that burst of perfectly valid writes as a
     * permanent refusal deleted them, and the teacher was told their register
     * had saved.
     *
     * So the rule is about the MEANING of the status, not its class: a refusal
     * of the request itself is dropped, a refusal to serve it right now is kept.
     */
    const rateLimitedOrUnavailable = response.status === 429 || response.status === 503;
    const droppable =
      response.status >= 400 && response.status < 500 && !rateLimitedOrUnavailable;

    if (droppable) {
      await remove(record.id);
      notify();
      return response;
    }

    await recordFailure(record, `server ${response.status}`);
    return response;
  } catch {
    /*
     * Offline, or the request never left. The row stays and the next flush
     * retries it.
     *
     * AND THE QUEUE SAYS SO. This branch used to return without notifying,
     * which meant the depth the banner reports was always the depth from the
     * last time something happened to notify it. A teacher who took a register
     * with no signal was shown "Offline. 0 changes queued on this device" with
     * a change sitting in the queue, and the only way to read that banner is
     * "your tap did not register" -- which is the one thing the screen promised
     * it would not do.
     *
     * The notification belongs HERE and not after the put in `enqueueWrite`,
     * because this is the only branch where a write becomes durable *and*
     * unsent. Notifying after the put would also announce the brief moment
     * where an online write is in the queue on its way to the server, so every
     * register would flash a syncing banner for a write that was never late.
     */
    notify();
    return null;
  }
}

async function recordFailure(record: OutboxEntry, reason: string): Promise<void> {
  const attempts = record.attempts + 1;
  try {
    const db = await getDb();
    if (attempts >= MAX_ATTEMPTS) {
      await db.delete(STORE, record.id);
    } else {
      await db.put(STORE, { ...record, attempts, lastError: reason });
    }
  } catch {
    // Nothing useful to do if storage itself is failing.
  }
  notify();
}

async function remove(id: string): Promise<void> {
  try {
    await (await getDb()).delete(STORE, id);
  } catch {
    // Best effort. A stale row replays to an idempotent endpoint anyway.
  }
}

/**
 * A READING OF THE QUEUE.
 *
 * `readable` is the whole point of this shape, and it exists because of a real
 * failure rather than a theoretical one.
 *
 * THE FAILURE. The e2e suite failed on 2026-10-26 with the register reading
 * "not set" after a replay that had been reported as done. The trace showed
 * the banner counting 1, then 0, then 1 again across a reload, with the queued
 * row never deleted. A count that goes 1 -> 0 -> 1 with the row still in
 * IndexedDB is a READ THAT FAILED and was reported as an empty queue.
 *
 * The old `pendingSummary()` caught every error and returned `{ count: 0 }`,
 * and the banner renders nothing when the count is zero. So one storage error
 * told the teacher "nothing is waiting" while a mark was waiting, and told
 * the test "the queue is empty" when it was not. The test then reloaded and
 * read a register the server had never been told about.
 *
 * So a read that failed is NOT a read that found nothing, and the two are no
 * longer the same value.
 */
export interface QueueSummary {
  /**
   * How many writes are waiting.
   *
   * ONLY A MEASUREMENT WHEN `readable` IS TRUE. When it is false this is the
   * last known count, which is a floor rather than a count: the queue could
   * not be read, so nothing is known about what is in it.
   */
  count: number;

  /** What the newest pending write is, when there is exactly one. */
  latest: string | null;

  /**
   * False when the queue could not be read at all.
   *
   * The banner must not treat this as "nothing is waiting". A teacher who
   * cannot see their queue cannot know whether their register is safe, and
   * saying nothing at all is the one answer that makes them think it is.
   */
  readable: boolean;
}

/**
 * The last reading, kept where a REMOUNT cannot lose it.
 *
 * The banner is a client component and React can throw it away and build it
 * again at any time. Its state starts empty, so a banner that remounts while a
 * write is queued begins by claiming that nothing is waiting. The row is still
 * in IndexedDB the whole time, so the queue is not empty and the teacher is
 * being told a lie for as long as the new banner takes to read.
 *
 * So the reading lives here, in the module, which outlives any component. A
 * banner that mounts reads what the outbox last saw rather than starting from
 * a guess.
 */
let lastSummary: QueueSummary = { count: 0, latest: null, readable: true };

/**
 * The last reading, synchronously.
 *
 * For a caller that has to render before it can await anything, which is
 * exactly the situation a freshly mounted banner is in.
 */
export function currentSummary(): QueueSummary {
  return lastSummary;
}

/**
 * How many writes are waiting, and what the most recent one is.
 *
 * One call rather than a count followed by a list, because the banner redraws
 * on every queue change and two IndexedDB round trips per event is the kind of
 * thing that makes a status banner feel heavier than the thing it is reporting.
 *
 * `latest` is only meaningful when there is exactly one pending write. With
 * several, naming one of them would imply the others are not waiting, so the
 * caller is expected to prefer the count in that case.
 */
export async function pendingSummary(): Promise<QueueSummary> {
  try {
    const entries = await (await getDb()).getAllFromIndex(STORE, 'by-createdAt');
    lastSummary =
      entries.length === 0
        ? { count: 0, latest: null, readable: true }
        : {
            count: entries.length,
            latest: entries[entries.length - 1].label || null,
            readable: true,
          };
    return lastSummary;
  } catch {
    /*
     * THE COUNT IS KEPT, THE READING IS NOT.
     *
     * A failed read leaves `readable` false and keeps the last known count, so
     * a banner that cannot check the queue still knows what it last saw. What
     * it must not do is report a count of zero, because zero is a claim that
     * the register is safe.
     */
    lastSummary = { ...lastSummary, readable: false };
    return lastSummary;
  }
}

/**
 * Every pending write, oldest first, or null when the queue could not be read.
 *
 * Null rather than an empty list, because an empty list is a claim that there
 * is nothing to send. The flush loop acts on this, so a wrong answer here
 * means a queued register is never sent.
 */
async function readPending(): Promise<OutboxEntry[] | null> {
  try {
    return await (await getDb()).getAllFromIndex(STORE, 'by-createdAt');
  } catch {
    return null;
  }
}

/**
 * Replays everything queued, oldest first.
 *
 * Sequential on purpose. Attendance for one class must land in the order it was
 * marked, and firing every replay at once would reorder it.
 *
 * `remaining` is null when the queue could not be read, which is not the same
 * as zero. Zero says the queue is empty; null says nobody knows.
 */
export async function flush(): Promise<{ sent: number; remaining: number | null }> {
  const entries = await readPending();
  if (entries === null) {
    /*
     * THE QUEUE COULD NOT BE READ, SO NOTHING WAS SENT.
     *
     * Reporting `remaining: 0` here would be the same lie in a second place:
     * the caller would conclude the queue is empty and stop trying. The next
     * tick reads it again, so a transient failure costs one interval rather
     * than the register.
     */
    return { sent: 0, remaining: null };
  }

  let sent = 0;

  for (const entry of entries) {
    const response = await attempt(entry);
    if (response?.ok) sent += 1;
  }

  const after = await readPending();
  return { sent, remaining: after === null ? null : after.length };
}

/**
 * The queue's own change notification, and the wake-up that goes with it.
 *
 * The banner needs to know when the depth changes. A custom event is cheaper
 * and simpler than a subscription channel for a value that changes at human
 * speed, and it keeps React out of the write path entirely.
 *
 * THE WAKE-UP IS THE OTHER HALF, AND IT IS NOT THE SAME THING.
 *
 * The event tells a component to redraw. The wake-up tells the flush loop
 * there is something to send. They are separate because a write can become
 * durable and unsent WITHOUT anything else happening: a teacher taps a
 * register, the request fails because the signal is gone, and the row is now
 * in IndexedDB with nothing to send it.
 *
 * Before this, that row was only picked up by the next poll, which is thirty
 * seconds away. So a teacher who took a register on a train was told it was
 * on the device, and then nothing happened for half a minute while the app
 * sat there knowing exactly what it had to send.
 */
const EVENT = 'liko:outbox-changed';

type Waker = () => void;

const wakers = new Set<Waker>();

/**
 * Tells the flush loop that there is work.
 *
 * The wakers are the flush loop that `startAutoFlush` installs. It is the
 * banner that starts it, because the banner is in the dashboard layout and the
 * dashboard is where registers are taken.
 */
function wake(): void {
  for (const waker of [...wakers]) {
    try {
      waker();
    } catch {
      // One waker that throws must not stop the others.
    }
  }
}

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeToOutbox(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener('online', handler);

  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('online', handler);
  };
}

/**
 * How long the loop waits before trying again, and how long it waits at most.
 *
 * THE SHORT END IS THE IMPORTANT ONE. The first attempt after a signal comes
 * back is the one that fails while the network is still settling, and a queue
 * whose only other trigger is a thirty second poll leaves a teacher looking at
 * a register that has not arrived yet. The ladder starts at two seconds and
 * backs off to the poll interval.
 */
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * Starts the reconnect loop. Idempotent: calling it twice installs one listener.
 *
 * Returns a teardown function.
 */
export function startAutoFlush(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let running = false;
  let retryTimer: number | null = null;
  let delay = RETRY_MIN_MS;

  function scheduleRetry(): void {
    if (retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void tick();
    }, delay);
    delay = Math.min(delay * 2, RETRY_MAX_MS);
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const { remaining } = await flush();
      /*
       * SOMETHING IS STILL WAITING, OR NOBODY COULD TELL.
       *
       * Either way the queue is not finished, so come back soon rather than
       * waiting for the backstop poll. A queue that empties resets the ladder,
       * so the next thing that has to be sent is not held back by the last
       * thing that took a while.
       */
      if (remaining === null || remaining > 0) {
        scheduleRetry();
      } else {
        delay = RETRY_MIN_MS;
      }
    } finally {
      running = false;
    }
  }

  /*
   * WHY THERE IS NO `navigator.onLine` GATE HERE.
   *
   * There was one, and it was the difference between a queue that sends and a
   * queue that sits there. `navigator.onLine` is a HINT about the network
   * interface, not a reachability test: a machine behind a captive portal or a
   * half-configured VPN reports "offline" while requests succeed, and a
   * browser that has not noticed a reconnect yet reports "offline" for a
   * moment after the signal comes back.
   *
   * Gating on that hint meant the reconnect event and the backstop poll both
   * consulted the same flag, so when the flag was wrong the queue was never
   * sent at all, and nothing in the product said so: the banner showed the
   * write as still waiting, which is honest, and the register never arrived.
   *
   * The gate was also unnecessary. This queue is written before it is sent, so
   * an attempt that cannot get through costs a failed request and leaves the
   * row where it was. The flush only sends when the queue holds something, so
   * an idle device makes no requests either way.
   */

  window.addEventListener('online', tick);
  // A slow poll catches the case where the device was online but the request
  // failed for another reason, which `online` alone never fires for.
  const timer = window.setInterval(tick, RETRY_MAX_MS);

  /*
   * AND THE QUEUE CAN WAKE THIS LOOP UP.
   *
   * A write that failed to go out is durable and unsent, and nothing else in
   * the product is going to send it. The queue calls `wake` when that happens,
   * and the loop comes back immediately instead of at the next poll.
   */
  const waker = () => void tick();
  wakers.add(waker);

  /*
   * AND IT FLUSHES ONCE, RIGHT NOW.
   *
   * THIS IS THE FIX FOR A REGISTER THAT WAS WAITING WHEN THE PAGE RELOADED.
   *
   * The queue is durable, so a page that loads with something in it has
   * something to send. Before this, the only things that started a flush were
   * an `online` event and the thirty second poll, so a page that loaded with
   * a queued register sat there until one of those happened to come round. The
   * `online` event is the one that matters: it fires when the signal comes
   * back, and the page that is asking about the queue is often the page that
   * loaded AFTER that, which has already missed it.
   *
   * It is also what happens when the service worker claims the page: the page
   * reloads, the queue is still in IndexedDB, and the new page has to send it
   * without waiting for an event that has already been and gone.
   */
  void tick();

  return () => {
    wakers.delete(waker);
    window.removeEventListener('online', tick);
    window.clearInterval(timer);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
  };
}