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
import { ORG_PLANS, type OrgPlan } from '@/lib/api/types';

export interface AdminResult {
  ok: boolean;
  message: string;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof DataError) return error.message;
  return fallback;
}

export async function updateOrgAction(input: {
  name: string;
  plan: string;
  seatLimit: number;
  billingEmail: string;
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

  try {
    const store = await data();
    await store.updateOrg(session.userId, {
      name,
      plan,
      seatLimit,
      billingEmail: billingEmail.length > 0 ? billingEmail : null,
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