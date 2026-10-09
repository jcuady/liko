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
    dbPromise = openDB<LikODB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
      },
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

  return attempt(record);
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

    // A 4xx will never succeed on replay. A 5xx might, so only 4xx is dropped.
    const droppable = response.status >= 400 && response.status < 500;
    if (droppable) {
      await remove(record.id);
      notify();
      return response;
    }

    await recordFailure(record, `server ${response.status}`);
    return response;
  } catch {
    // Offline. The row stays and the next flush retries it.
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

/** Every pending write, oldest first. Drives the OfflineBanner count. */
export async function pendingCount(): Promise<number> {
  try {
    return await (await getDb()).count(STORE);
  } catch {
    return 0;
  }
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
export async function pendingSummary(): Promise<{ count: number; latest: string | null }> {
  try {
    const entries = await (await getDb()).getAllFromIndex(STORE, 'by-createdAt');
    if (entries.length === 0) return { count: 0, latest: null };
    return {
      count: entries.length,
      latest: entries[entries.length - 1].label || null,
    };
  } catch {
    return { count: 0, latest: null };
  }
}

export async function listPending(): Promise<OutboxEntry[]> {
  try {
    return await (await getDb()).getAllFromIndex(STORE, 'by-createdAt');
  } catch {
    return [];
  }
}

/**
 * Replays everything queued, oldest first.
 *
 * Sequential on purpose. Attendance for one class must land in the order it was
 * marked, and firing every replay at once would reorder it.
 */
export async function flush(): Promise<{ sent: number; remaining: number }> {
  const entries = await listPending();
  let sent = 0;

  for (const entry of entries) {
    const response = await attempt(entry);
    if (response?.ok) sent += 1;
  }

  return { sent, remaining: await pendingCount() };
}

// --- change notification ----------------------------------------------------
//
// The banner needs to know when the depth changes. A custom event is cheaper
// and simpler than a subscription channel for a value that changes at human
// speed, and it keeps React out of the write path entirely.

const EVENT = 'liko:outbox-changed';

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
 * Starts the reconnect loop. Idempotent: calling it twice installs one listener.
 *
 * Returns a teardown function.
 */
export function startAutoFlush(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let running = false;

  const tick = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      await flush();
    } finally {
      running = false;
    }
  };

  window.addEventListener('online', tick);
  // A slow poll catches the case where the device was online but the request
  // failed for another reason, which `online` alone never fires for.
  const timer = window.setInterval(tick, 30_000);

  return () => {
    window.removeEventListener('online', tick);
    window.clearInterval(timer);
  };
}