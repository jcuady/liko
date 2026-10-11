'use server';

/**
 * Redeeming an organisation invitation.
 *
 * WHY THIS IS A SERVER ACTION AND NOT A CLIENT CALL. The person redeeming holds
 * one thing: a code. Deciding whether that code puts them in a school, under
 * which role, and whether the school has a seat left is not something a browser
 * gets a vote in, so all three answers come from the database.
 */

import { redirect } from 'next/navigation';

import { data } from '@/lib/api/client';
import { DataError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/auth/guards';
import { landingPathFor } from '@/lib/auth/rbac';

export interface JoinResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function redeemInviteAction(
  _previous: JoinResult | null,
  formData: FormData,
): Promise<JoinResult> {
  /*
   * `class:read` is the gate, and the choice is deliberate.
   *
   * It is the one grant every role in the matrix holds: `yes` for staff, `own`
   * for a student, `linked` for a guardian, and `can` counts a scoped grant as
   * permitted. So what this asserts is the entry condition for redeeming
   * anything at all, which is a signed-in account with a role and nobody else's
   * records yet.
   *
   * NOT `org:manage`, which would be the obvious pick: a student is invited into
   * a school by exactly the same code an administrator issues to a colleague,
   * and gating on the administrator's permission would refuse every student and
   * guardian this product invites.
   */
  const session = await requirePermission('class:read');

  const code = String(formData.get('code') ?? '').trim();
  if (!code) {
    return { ok: false, fieldErrors: { code: 'Enter the code from your invitation.' } };
  }

  try {
    const store = await data();
    await store.redeemInvite(session.userId, code);
  } catch (error) {
    /*
     * The refusal is the product, so it is passed through whole.
     *
     * When a school is at its seat limit the message names the school, the count
     * and the way out, and it ends by saying to use the code again once the
     * limit is raised. Replacing that with "something went wrong" would leave the
     * person reading it with nothing to do but guess, and would make the seat
     * limit look like a fault rather than a decision.
     */
    if (error instanceof DataError) return { ok: false, message: error.message };
    return { ok: false, message: 'That code could not be used. Ask for a new one.' };
  }

  /*
   * `/overview` for staff, and the role's own landing page for anybody else.
   * `landingPathFor` is the same rule login uses, so a student who redeems an
   * invitation reaches their classes rather than a forbidden screen.
   */
  redirect(landingPathFor(session.role));
}