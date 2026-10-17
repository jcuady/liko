'use server';

import { z } from 'zod';

import { data } from '@/lib/api/client';
import { requireSession } from '@/lib/auth/guards';
import type { NotificationRecord } from '@/lib/api/types';

/**
 * The two requests the notification bell makes.
 *
 * WHY A SESSION AND NOT A PERMISSION. Nobody has to be allowed to see their own
 * inbox: the rows are addressed to one account and the read, update and delete
 * policies are all `user_id = auth.uid()`. A permission here would be a second
 * gate in front of the same answer, and a second gate is one more thing to get
 * wrong for no gain. The write half is `class:write` at the database and is not
 * this file's business: nothing here decides who may notify whom.
 *
 * WHY THE IDS ARE VALIDATED. This is a server action, which means the caller is
 * a browser and the argument is whatever the browser sent. The seam scopes every
 * mark to the session account, so a forged id cannot reach another person's row,
 * but an unbounded array is still a request nobody should be able to make.
 */

const READ_BATCH = z
  .array(z.string().min(1).max(64))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'The same notification was listed twice.',
  });

export interface NotificationInbox {
  items: NotificationRecord[];
}

export interface NotificationResult {
  ok: boolean;
  message?: string;
}

/**
 * The bell's inbox, newest first, capped by the seam at fifty.
 *
 * Read fresh rather than passed down from a page, because the bell lives in the
 * shell: it is mounted once and outlives every route, so a value handed to it
 * at render time would go stale the moment the teacher saved a class without
 * changing page.
 */
export async function loadNotificationInbox(): Promise<NotificationInbox> {
  const session = await requireSession();
  try {
    const store = await data();
    return { items: await store.listNotifications(session.userId) };
  } catch {
    /*
     * A bell that throws takes the header with it, and the header is the one
     * piece of chrome every page needs. An inbox that cannot be read is an empty
     * inbox, said so rather than assumed.
     */
    return { items: [] };
  }
}

/**
 * Marks rows read. Every id is scoped to the caller's own account by the seam,
 * so this cannot mark a notification in somebody else's inbox read.
 *
 * Failures are per id rather than per request: one unreadable row must not leave
 * the other forty-nine showing as unread.
 */
export async function markNotificationsRead(input: {
  ids: string[];
}): Promise<NotificationResult> {
  const session = await requireSession();

  const checked = READ_BATCH.safeParse(input?.ids);
  if (!checked.success) {
    return { ok: false, message: 'That is not a list of notifications.' };
  }

  try {
    const store = await data();
    for (const id of checked.data) {
      await store.markNotificationRead(session.userId, id);
    }
  } catch {
    return { ok: false, message: 'Those could not be marked as read.' };
  }

  return { ok: true };
}