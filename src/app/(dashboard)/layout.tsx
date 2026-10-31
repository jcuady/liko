import { redirect } from 'next/navigation';

import { LikoLogo } from '@/components/brand/LikoLogo';
import { data } from '@/lib/api/client';
import { requireSession } from '@/lib/auth/guards';
import { DEFAULT_TIME_ZONE } from '@/lib/dates';
import type { NotificationRecord } from '@/lib/api/types';
import { Sidebar, MobileTabBar } from './components/Navigation';
import { OfflineBanner } from './components/OfflineBanner';
import { TenantZoneProvider } from './components/TenantZone';
import { UserMenu } from './components/UserMenu';
import { CommandPalette } from './components/CommandPalette';
import { NotificationBell } from './components/NotificationBell';

/**
 * App shell.
 *
 * Desktop: fixed sidebar beside scrolling content.
 * Mobile: bottom tab bar, with bottom padding on the content equal to the bar
 * height plus the safe-area inset so nothing is permanently hidden behind it.
 *
 * The session is read here rather than in each page, so authorisation happens
 * once for the whole group.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  if (!session) redirect('/login');

  /*
   * The unread count belongs on the first paint rather than after a request the
   * browser makes once it has already drawn the header, so the bell is fed here
   * where the session is already in hand. A read that fails leaves the bell with
   * no badge, which is the honest state to be in when the inbox could not be
   * read, and never takes the shell down with it.
   */
  let notifications: NotificationRecord[] = [];
  let zone = DEFAULT_TIME_ZONE;
  try {
    const store = await data();
    notifications = await store.listNotifications(session.userId);
    /*
     * THE INSTITUTION'S ZONE, READ ONCE FOR THE WHOLE DASHBOARD.
     *
     * A date rendered in the browser's own zone is rendered twice, and the
     * server and the browser disagree whenever a timestamp near midnight
     * falls on different days in the two zones. That disagreement is a
     * hydration error, and the live check found one on `/slides`: a deck
     * edited at 20:58 UTC is the 26th in UTC and the 27th in Manila.
     *
     * So the zone is fixed before anything is rendered, and it is fixed for
     * every page at once. A page added tomorrow cannot forget to, because it
     * does not choose the zone.
     */
    const org = await store.getOrg(session.userId);
    zone = org?.profile.timezone ?? DEFAULT_TIME_ZONE;
  } catch {
    notifications = [];
  }

  return (
    <TenantZoneProvider zone={zone}>
      <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <a
        href="#workspace-main"
        className="sr-only-focusable left-4 top-4 z-50 rounded-[8px] bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent"
      >
        Skip to content
      </a>

      <div className="flex min-h-[100dvh] w-full flex-col lg:min-h-[100dvh] lg:w-auto lg:flex-row">
        <div className="hidden lg:flex lg:flex-col">
          <div className="flex h-[68px] items-center border-b border-border px-5">
            <LikoLogo showWordmark />
          </div>
          <Sidebar role={session.role} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-lg sm:px-6">
            <div className="lg:hidden">
              <LikoLogo showWordmark />
            </div>

            <div className="hidden flex-1 lg:block">
              <CommandPalette />
            </div>

            <div className="flex items-center gap-1">
              <NotificationBell initialItems={notifications} />
              <UserMenu email={session.email} />
            </div>
          </header>

          <OfflineBanner />

          {/*
            pb reserves room for the mobile tab bar plus the home indicator, so
            the last element of the page is never trapped underneath it.
          */}
          <main
            id="workspace-main"
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-6 focus:outline-none sm:px-6 lg:px-8 lg:pb-10"
          >
            {children}
          </main>
        </div>
      </div>

      <MobileTabBar role={session.role} />
      </div>
    </TenantZoneProvider>
  );
}