'use server';

/**
 * Administration writes.
 *
 * WHY SERVER ACTIONS AND TWO GATES. The actions below check the permission from
 * the session matrix, and the seam checks again that the caller is an active
 * admin of the organisation that owns the row being changed. Both are needed: a
 * server action is a public endpoint that `proxy.ts` never sees, and a session
 * role says what someone may do without saying whose records they may do it to.
 *
 * WHY REFUSALS CARRY A REASON. "Something went wrong" tells a head of department
 * nothing about why a promotion was refused. Every refusal below names the thing
 * that has to change first.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { DataError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/auth/guards';
import { isRole, type Role } from '@/lib/auth/rbac';
import {
  ORG_PLANS,
  ORG_SECTORS,
  type InviteRecord,
  type OrgPlan,
  type OrgProfileInput,
  type OrgSector,
} from '@/lib/api/types';

export interface AdminResult {
  ok: boolean;
  message: string;
}

/** The bounds the `organizations` check constraints allow on the grade columns. */
const GRADE_MIN = -2;
const GRADE_MAX = 16;

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof DataError) return error.message;
  return fallback;
}

type ProfileParse = { ok: true; profile: OrgProfileInput } | { ok: false; message: string };

/**
 * The institutional profile, checked against the same bounds the database
 * enforces on those columns.
 *
 * WHY REFUSED RATHER THAN CLAMPED. A grade span of 4 to 99 or a country of
 * "philippines" would come back from Postgres as a constraint violation on a
 * save the admin believes worked. Refusing here, naming the field, is the only
 * place they learn which one is wrong.
 *
 * The verification columns are absent from the input type and from the patch
 * below, and that is the point of the whole function: the form is allowed to
 * describe an institution and is never allowed to vouch for one.
 */
function parseProfile(raw: {
  countryCode: string | null;
  sector: string | null;
  gradeMin: number | null;
  gradeMax: number | null;
  enrolment: number | null;
  timezone: string | null;
  contactName: string | null;
  contactRole: string | null;
}): ProfileParse {
  const countryCode = (raw.countryCode ?? '').trim().toUpperCase();
  if (countryCode.length > 0 && !/^[A-Z]{2}$/.test(countryCode)) {
    return { ok: false, message: 'A country code is two letters, such as PH.' };
  }

  const sector = (raw.sector ?? '').trim();
  if (sector.length > 0 && !ORG_SECTORS.includes(sector as OrgSector)) {
    return { ok: false, message: 'Choose one of the sectors listed.' };
  }

  const grades = [raw.gradeMin, raw.gradeMax];
  const gradeIsBad = grades.some(
    (value) => value !== null && (!Number.isInteger(value) || value < GRADE_MIN || value > GRADE_MAX),
  );
  if (gradeIsBad) {
    return {
      ok: false,
      message: `Grades are whole numbers from ${GRADE_MIN} to ${GRADE_MAX}, where 0 is kindergarten.`,
    };
  }
  // The same sanity rule the table carries: a span with its ends the wrong way
  // round is not a wider span, it is a narrower one described badly.
  if (raw.gradeMin !== null && raw.gradeMax !== null && raw.gradeMin > raw.gradeMax) {
    return { ok: false, message: 'The lowest grade has to come before the highest grade.' };
  }

  // Zero is allowed because a workspace whose first class has not been taught
  // yet genuinely has no pupils, and recording that is more honest than
  // recording an estimate of one.
  if (raw.enrolment !== null && (!Number.isInteger(raw.enrolment) || raw.enrolment < 0)) {
    return { ok: false, message: 'Pupils or students has to be zero or more.' };
  }

  const timezone = (raw.timezone ?? '').trim().slice(0, 64);
  const contactName = (raw.contactName ?? '').trim().slice(0, 120);
  const contactRole = (raw.contactRole ?? '').trim().slice(0, 120);

  return {
    ok: true,
    profile: {
      countryCode: countryCode.length > 0 ? countryCode : null,
      sector: sector.length > 0 ? (sector as OrgSector) : null,
      gradeMin: raw.gradeMin,
      gradeMax: raw.gradeMax,
      enrolment: raw.enrolment,
      timezone: timezone.length > 0 ? timezone : null,
      contactName: contactName.length > 0 ? contactName : null,
      contactRole: contactRole.length > 0 ? contactRole : null,
    },
  };
}

export async function updateOrgAction(input: {
  name: string;
  plan: string;
  seatLimit: number;
  billingEmail: string;
  profile?: {
    countryCode: string | null;
    sector: string | null;
    gradeMin: number | null;
    gradeMax: number | null;
    enrolment: number | null;
    timezone: string | null;
    contactName: string | null;
    contactRole: string | null;
  };
}): Promise<AdminResult> {
  const session = await requirePermission('org:manage');

  const name = input.name.trim().slice(0, 160);
  const plan = ORG_PLANS.includes(input.plan as OrgPlan) ? (input.plan as OrgPlan) : null;
  const seatLimit = Math.round(input.seatLimit);
  const billingEmail = input.billingEmail.trim().toLowerCase().slice(0, 160);

  if (name.length < 2) {
    return { ok: false, message: 'Give the organisation a name of at least two characters.' };
  }
  if (!plan) {
    return { ok: false, message: 'Choose one of the plans listed.' };
  }
  if (!Number.isFinite(seatLimit) || seatLimit < 1 || seatLimit > 10_000) {
    return { ok: false, message: 'Seats must be a whole number between 1 and 10,000.' };
  }
  // An address that will bounce is worse than none: the renewal goes to the
  // wrong place and nobody notices until the term is over.
  if (billingEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    return { ok: false, message: 'That billing email address does not look right.' };
  }

  /*
   * Parsed before the store call rather than inside it, so a bad country code
   * and a full seat limit are reported in the same refusal rather than one
   * silently overwriting the other.
   */
  let profile: OrgProfileInput | undefined;
  if (input.profile) {
    const parsed = parseProfile(input.profile);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    profile = parsed.profile;
  }

  try {
    const store = await data();
    await store.updateOrg(session.userId, {
      name,
      plan,
      seatLimit,
      billingEmail: billingEmail.length > 0 ? billingEmail : null,
      profile,
    });
  } catch (error) {
    return { ok: false, message: messageFor(error, 'The organisation could not be saved.') };
  }

  revalidatePath('/admin');
  return { ok: true, message: 'Organisation saved.' };
}

export async function setMemberRoleAction(input: {
  memberId: string;
  role: string;
}): Promise<AdminResult> {
  const session = await requirePermission('user:manage');

  const memberId = input.memberId.trim();
  if (!memberId) return { ok: false, message: 'That person could not be found.' };
  if (!isRole(input.role)) {
    return { ok: false, message: 'Choose one of the roles listed.' };
  }

  try {
    const store = await data();
    await store.setMemberRole(session.userId, memberId, input.role as Role);
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That role could not be changed.') };
  }

  revalidatePath('/admin');
  return { ok: true, message: 'Role updated.' };
}

export async function setMemberStatusAction(input: {
  memberId: string;
  status: string;
}): Promise<AdminResult> {
  const session = await requirePermission('user:manage');

  const memberId = input.memberId.trim();
  if (!memberId) return { ok: false, message: 'That person could not be found.' };
  if (input.status !== 'active' && input.status !== 'suspended') {
    return { ok: false, message: 'Choose whether to suspend or restore this person.' };
  }

  try {
    const store = await data();
    await store.setMemberStatus(session.userId, memberId, input.status);
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That person could not be updated.') };
  }

  revalidatePath('/admin');
  return { ok: true, message: input.status === 'suspended' ? 'Access suspended.' : 'Access restored.' };
}

/**
 * The seat count on its own.
 *
 * `updateOrg` replaces the whole record, so a seats-only save has to hand back
 * the name, plan and billing contact it is not changing. Reading them from the
 * store rather than from the form is what stops a one-field save from quietly
 * blanking the other three when two people are in this screen at once.
 */
export async function updateSeatLimitAction(input: { seatLimit: number }): Promise<AdminResult> {
  const session = await requirePermission('org:manage');

  const seatLimit = Math.round(input.seatLimit);
  if (!Number.isFinite(seatLimit) || seatLimit < 1 || seatLimit > 10_000) {
    return { ok: false, message: 'Seats must be a whole number between 1 and 10,000.' };
  }

  try {
    const store = await data();
    const org = await store.getOrg(session.userId);
    if (!org) return { ok: false, message: 'This account has no organisation yet.' };

    await store.updateOrg(session.userId, {
      name: org.name,
      plan: org.plan,
      seatLimit,
      billingEmail: org.billingEmail,
    });
  } catch (error) {
    /*
     * The refusal that matters here is the conflict, not a crash.
     *
     * Lowering the limit below the people already seated is refused by design,
     * and it is refused at exactly the moment a head of department is most
     * likely to try it: cutting a subscription after a merger. `messageFor`
     * passes the reason through, so the toast says how many people are seated
     * instead of showing a stack trace for a decision the product made on
     * purpose.
     */
    return { ok: false, message: messageFor(error, 'The seat limit could not be changed.') };
  }

  revalidatePath('/admin');
  return { ok: true, message: 'Seat limit updated.' };
}

export interface InviteListResult {
  ok: boolean;
  message: string;
  invites: InviteRecord[];
}

/**
 * Every invitation this organisation has issued, spent and lapsed included.
 *
 * A read that the console pulls on its own rather than a prop from `page.tsx`:
 * issuing a code has to put the new row on screen without a full page refresh,
 * and one action that answers "what does the list look like now" keeps that in
 * a single place.
 */
export async function listInvitesAction(): Promise<InviteListResult> {
  const session = await requirePermission('org:manage');

  try {
    const store = await data();
    const invites = await store.listInvites(session.userId);
    return { ok: true, message: '', invites };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'Invitations could not be loaded.'), invites: [] };
  }
}

/**
 * Issues one invitation.
 *
 * The code is minted inside the data layer and is returned here so the console
 * can show it once. It is not emailed: this product has no outbound mail, and a
 * code that exists only in an administrator's browser is a code they can hand
 * over in a corridor, which is the point.
 */
export async function createInviteAction(input: {
  email: string;
  role: string;
}): Promise<AdminResult & { code?: string; expiresAt?: string }> {
  const session = await requirePermission('org:manage');

  const email = input.email.trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'Enter the email address you are inviting.' };
  }
  if (!isRole(input.role)) {
    return { ok: false, message: 'Choose one of the roles listed.' };
  }

  try {
    const store = await data();
    const invite = await store.createInvite(session.userId, { email, role: input.role as Role });
    return {
      ok: true,
      message: `Invitation ready for ${invite.email}.`,
      code: invite.code,
      expiresAt: invite.expiresAt,
    };
  } catch (error) {
    return { ok: false, message: messageFor(error, 'That invitation could not be created.') };
  }
}