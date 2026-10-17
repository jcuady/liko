'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { useIsHydrated } from '@/lib/hooks/use-media-query';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import type { NotificationRecord } from '@/lib/api/types';
import { loadNotificationInbox, markNotificationsRead } from './notification-actions';

/**
 * The bell in the header.
 *
 * WHY IT IS FEDED FROM THE LAYOUT AND REFETCHED ON OPEN. The shell is rendered
 * once and outlives every route, so a list handed to it at render time goes
 * stale the moment a teacher saves a class without changing page. The layout
 * supplies the first copy so the badge is right with no waterfall on load, and
 * opening the menu asks again, so what a student reads is what is in the table.
 *
 * WHY NOTHING IS SUBSCRIBED TO. `notifications` is on the realtime publication
 * and a socket per open tab is a real cost for an update that is not urgent: a
 * timetable that changed is still changed in the morning. A subscription here
 * would also fire in fixture mode against a database no fixture ever writes to,
 * which is a surface that looks live and is not.
 *
 * WHY THE TIMESTAMP WAITS FOR HYDRATION. "4 min ago" is a function of now, and
 * now is the server's clock on the first render and the browser's on the next.
 * A row that crosses a boundary between the two is a hydration mismatch, so the
 * stamp is omitted until the client is mounted and never rendered from two
 * disagreeing clocks. This is the one thing `useIsHydrated` is for.
 */

/** Rows shown before the list says how many more there are. */
const VISIBLE = 8;

interface NotificationBellProps {
  /** Read by the layout, so the badge is correct on the first paint. */
  initialItems: NotificationRecord[];
}

export function NotificationBell({ initialItems }: NotificationBellProps) {
  const [items, setItems] = React.useState(initialItems);
  const [open, setOpen] = React.useState(false);
  const mounted = useIsHydrated();

  const unread = items.filter((item) => item.readAt === null).length;
  const shown = items.slice(0, VISIBLE);

  /*
   * Re-asked on open, not on a timer. A poll would mean a request from every
   * open tab on a timer for a number that only moves when somebody acts, and the
   * open is the moment the number is about to be read.
   */
  React.useEffect(() => {
    if (!open) return;
    let live = true;
    loadNotificationInbox()
      .then((inbox) => {
        if (live) setItems(inbox.items);
      })
      .catch(() => {
        // The list already on screen stands. An inbox that will not reload is
        // not a reason to empty a bell the reader can already use.
      });
    return () => {
      live = false;
    };
  }, [open]);

  const mark = React.useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    const stamp = new Date().toISOString();
    // Marked locally first, so the badge answers the click rather than the round
    // trip. A refusal below puts the rows back.
    const before = items;
    setItems((current) =>
      current.map((item) =>
        ids.includes(item.id) ? { ...item, readAt: item.readAt ?? stamp } : item,
      ),
    );

    const result = await markNotificationsRead({ ids }).catch(() => ({
      ok: false,
      message: 'Those could not be marked as read.',
    }));
    if (!result.ok) {
      setItems(before);
      toast.error(result.message ?? 'That did not work. Try again.');
    }
  }, [items]);

  const label = unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          className="relative shrink-0"
        >
          <Bell aria-hidden="true" />
          {/*
            The dot is decoration. The count it sits on is already in the
            trigger's accessible name, so announcing it twice would make a
            screen reader say the number and then say it again.
          */}
          {unread > 0 ? (
            <span
              aria-hidden="true"
              data-slot="notification-badge"
              className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-semibold leading-none text-on-accent"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        aria-label="Notifications"
        className="w-[min(22rem,calc(100vw-2rem))]"
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {unread > 0 ? (
            <span className="text-meta text-ink-muted">
              {unread} unread
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {shown.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-body text-ink-muted">
            Nothing here yet. When your timetable or your classes change, you will be told
            here.
          </p>
        ) : (
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {shown.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                mounted={mounted}
                onRead={() => mark([item.id])}
              />
            ))}
          </div>
        )}

        {items.length > shown.length ? (
          <p className="px-2.5 py-1.5 text-meta text-ink-muted">
            Showing the {shown.length} most recent of {items.length}.
          </p>
        ) : null}

        {unread > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void mark(items.filter((item) => item.readAt === null).map((item) => item.id));
              }}
            >
              <Check aria-hidden="true" />
              Mark all as read
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One row.
 *
 * A row with somewhere to go is a link, and opening it marks the row read. A
 * row with nowhere to go is still selectable so it can be marked read, but it
 * is not dressed as a link that would then do nothing.
 */
function NotificationRow({
  item,
  mounted,
  onRead,
}: {
  item: NotificationRecord;
  mounted: boolean;
  onRead: () => void;
}) {
  const className = cn(
    'flex flex-col items-start gap-0.5 rounded-[8px] px-2.5 py-2.5',
    item.readAt === null && 'bg-accent-subtle/40',
  );

  const body = (
    <>
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="text-body font-semibold text-ink">{item.title}</span>
        <span className="shrink-0 text-meta text-ink-muted">
          {mounted ? relativeTime(item.createdAt) : null}
        </span>
      </span>
      <span className="text-body text-ink-muted">{item.body}</span>
      {item.readAt === null ? (
        <span className="sr-only">Unread.</span>
      ) : null}
    </>
  );

  if (item.url) {
    return (
      <DropdownMenuItem asChild className={className}>
        <Link href={item.url} onClick={onRead}>
          {body}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem className={className} onSelect={onRead}>
      {body}
    </DropdownMenuItem>
  );
}