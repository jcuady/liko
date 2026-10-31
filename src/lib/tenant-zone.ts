import { data } from '@/lib/api/client';
import { DEFAULT_TIME_ZONE } from '@/lib/dates';

/**
 * The institution's zone, for a server component that renders a date.
 *
 * A date rendered on the server is rendered once, so it cannot be a hydration
 * error. It can still be the wrong day, because the server runs in UTC and
 * the day a lesson happened is the school's day. So a server component that
 * renders a date asks for the zone rather than accepting the server's.
 *
 * The answer is the institution's, resolved through the caller's membership
 * rather than through a profile column, so every member of the tenant gets
 * the same answer and a caller cannot reach another tenant's by asking.
 *
 * UTC when the institution has not said, which is the same on every side.
 */
export async function tenantTimeZone(userId: string): Promise<string> {
  const store = await data();
  const org = await store.getOrg(userId);
  return org?.profile.timezone ?? DEFAULT_TIME_ZONE;
}
