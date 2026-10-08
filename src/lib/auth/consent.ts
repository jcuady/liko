import { isSupabaseMode } from '@/lib/data-mode';
import { createSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Consent records.
 *
 * WHY THIS IS NOT A COLUMN ON `profiles`.
 *
 * `profiles` carries a `for all using (id = auth.uid())` policy. RLS restricts
 * rows, not columns, so the account holder can `update` any column on their own
 * row, which means a timestamp written there is evidence the account holder can
 * edit. A consent record that the subject can rewrite is not a consent record.
 *
 * `consent_events` therefore has row level security enabled and NO policies at
 * all. That is deliberate: with no policy the table is invisible and unwritable
 * to the authenticated user, and only the service role, which bypasses RLS, can
 * write. The account holder cannot forge, edit, or delete a record, and cannot
 * read one either.
 *
 * It is an append-only log. Re-accepting after a terms change adds a row rather
 * than overwriting the old one, so the question "what had this person agreed to
 * on the day they signed up" still has an answer after the next edit.
 */

/**
 * Bumped whenever the published text of `/terms` or `/privacy` changes
 * materially. A record written under an older version is not evidence for the
 * current one, so the version is stored alongside the acceptance.
 */
export const TERMS_VERSION = '2026-02-01';

export type ConsentSubject = 'terms' | 'privacy' | 'cookies';

/** Where the acceptance came from. Both non-self-service paths are deliberate. */
export type ConsentSource =
  | 'self_registration'
  | 'teacher_invite'
  | 'cookie_banner';

export interface ConsentRecord {
  userId: string;
  email: string;
  subject: ConsentSubject;
  version: string;
  acceptedAt: string;
  source: ConsentSource;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Fixture-mode store.
 *
 * On `globalThis` for the reason documented in `store.ts`: a module-level map is
 * per *bundle*, and Next gives a page and the server action it calls separate
 * copies of a shared module, so an acceptance written by `registerAction` would
 * be invisible to whatever renders it afterwards.
 */
const globalScope = globalThis as typeof globalThis & {
  __likoConsent?: ConsentRecord[];
};

const records: ConsentRecord[] = (globalScope.__likoConsent ??= []);

/** Truncated to the width Postgres would keep, so both modes agree on the shape. */
const MAX_AGENT = 300;

export interface RecordConsentInput {
  userId: string;
  email: string;
  subject: ConsentSubject;
  source: ConsentSource;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends one acceptance.
 *
 * Failure is swallowed on purpose. Consent is recorded as a side effect of an
 * action the user is entitled to complete: refusing to create the account
 * because the audit row could not be written would punish the user for our
 * database being unavailable, and the account itself is the thing they asked
 * for. The alternative, failing loudly, is the right call for a payment or a
 * medical record and the wrong one here.
 */
export async function recordConsent(input: RecordConsentInput): Promise<boolean> {
  const record: ConsentRecord = {
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    subject: input.subject,
    version: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    source: input.source,
    ip: input.ip ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, MAX_AGENT) : null,
  };

  if (!isSupabaseMode()) {
    records.push(record);
    return true;
  }

  try {
    const admin = await createSupabaseAdmin();
    if (!admin) return false;

    const { error } = await admin.from('consent_events').insert({
      user_id: record.userId,
      email: record.email,
      subject: record.subject,
      version: record.version,
      accepted_at: record.acceptedAt,
      source: record.source,
      ip: record.ip,
      user_agent: record.userAgent,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Every acceptance for one account, oldest first. Used by tests and audit. */
export function listConsent(userId: string): ConsentRecord[] {
  return records
    .filter((record) => record.userId === userId)
    .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));
}

/** Test-only. Clears fixture records so a suite does not leak into the next. */
export function resetConsentForTests(): void {
  records.length = 0;
}