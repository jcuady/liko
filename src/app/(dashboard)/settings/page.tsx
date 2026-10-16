import { redirect } from 'next/navigation';

import { requirePagePermission } from '@/lib/auth/guards';

/**
 * `/settings` on its own.
 *
 * WHY THIS REDIRECTS INSTEAD OF RENDERING AN INDEX. There was no `page.tsx`
 * here, so `/settings` returned a 404 while `/settings/profile`,
 * `/settings/notifications` and `/settings/appearance` all worked. Nothing in
 * the sidebar links to `/settings` itself, so the only way to reach it was to
 * type it, which is exactly the moment a person already knows the feature
 * exists and deserves a page rather than an error.
 *
 * WHY PROFILE IS THE TARGET. `/settings/profile` is gated on `class:read`,
 * which all four roles hold, so redirecting there cannot bounce the person
 * straight back out through `/forbidden`. The other two are role-specific and
 * the sidebar already hides them from roles that lack the permission.
 *
 * WHY THE GATE STILL RUNS. A redirect is not an exemption. This calls the same
 * `class:read` guard the page it points at calls, so an unauthenticated request
 * is refused here rather than being handed a redirect chain to somewhere it
 * should not be. The guard never returns for a role that lacks the permission.
 */
export default async function SettingsIndexPage() {
  await requirePagePermission('class:read');
  redirect('/settings/profile');
}