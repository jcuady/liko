'use server';

/**
 * Onboarding writes.
 *
 * The wizard exists because an empty workspace answers none of the questions a
 * teacher actually has. Which school, what do you teach, how do you grade, what
 * is the first class. Asked once here, every later screen can be specific;
 * asked nowhere, the teacher rebuilds the same answers in six different dialogs.
 *
 * Each step writes immediately rather than being held until the last one. A
 * wizard that loses everything if the tab closes is worse than no wizard, and a
 * half-finished profile is still better than an empty one.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseSubjects } from '@/lib/profile/subjects';
import type { ClassLevel, ProfileInput, ProfileRecord } from '@/lib/api/types';

export interface StepResult {
  ok: boolean;
  message: string;
  profile?: ProfileRecord;
}

const LEVELS: ClassLevel[] = ['preschool', 'k12', 'university'];

function levelOf(value: string): ClassLevel | null {
  const level = value.trim();
  return LEVELS.includes(level as ClassLevel) ? (level as ClassLevel) : null;
}

/**
 * `updateProfile` writes the whole row, so a step that only owns one field has
 * to carry the rest across. Reading the saved profile and patching it is what
 * lets each wizard step own its own answer without the neighbouring steps
 * silently reverting to empty.
 */
async function patchProfile(
  store: Awaited<ReturnType<typeof data>>,
  userId: string,
  email: string,
  patch: Partial<ProfileInput>,
): Promise<ProfileRecord> {
  const current = await store.getProfile(userId);
  const knownName = current?.fullName?.trim() ?? '';

  return store.updateProfile(userId, {
    fullName: knownName.length > 0 ? knownName : (email.split('@')[0] ?? '').slice(0, 120),
    schoolName: current?.schoolName ?? null,
    subjects: current?.subjects ?? [],
    defaultGradeLevel: current?.defaultGradeLevel ?? null,
    gradingPolicyId: current?.gradingPolicyId ?? null,
    ...patch,
  });
}

export async function saveOnboardingProfile(input: {
  schoolName: string;
  subjects: string;
  defaultGradeLevel: string;
}): Promise<StepResult> {
  const session = await requirePermission('class:read');
  const defaultGradeLevel = levelOf(input.defaultGradeLevel);

  try {
    const store = await data();

    /*
     * The name was typed at registration and is not asked again here, so
     * `patchProfile` carries it across rather than rebuilding it from the
     * address, which also means this step cannot blank a field it does not own.
     *
     * `gradingPolicyId` is deliberately not written here. It used to be saved on
     * this step with a default of `percentage`, which meant the scale question on
     * the next step always looked already answered, and the scale the teacher
     * then picked was only ever applied to the first class: their default stayed
     * `percentage` for every class after it.
     */
    const profile = await patchProfile(store, session.userId, session.email, {
      schoolName: input.schoolName.trim().slice(0, 160) || null,
      subjects: parseSubjects(input.subjects),
      defaultGradeLevel,
    });

    revalidatePath('/welcome');
    revalidatePath('/settings/profile');
    return { ok: true, message: 'Saved.', profile };
  } catch {
    return { ok: false, message: 'Those details could not be saved.' };
  }
}

/**
 * The scale step writes only the scale.
 *
 * Split from the step above so that arriving on this step means "the teaching
 * context is settled", which is what lets `/welcome` resume a half-finished
 * wizard at the first genuinely unanswered question instead of restarting it.
 */
export async function saveGradingPolicy(input: {
  gradingPolicyId: string;
}): Promise<StepResult> {
  const session = await requirePermission('class:read');

  const policyId = input.gradingPolicyId.trim();

  try {
    const store = await data();
    const policies = await store.listPolicies(session.userId);

    // A scale id that is not one the teacher can actually see would leave the
    // profile pointing at nothing, and every later class would fall back to a
    // percentage silently.
    if (!policies.some((policy) => policy.id === policyId)) {
      return { ok: false, message: 'Pick one of the grading scales listed.' };
    }

    const profile = await patchProfile(store, session.userId, session.email, {
      gradingPolicyId: policyId,
    });

    revalidatePath('/welcome');
    revalidatePath('/settings/profile');
    return { ok: true, message: 'Scale saved.', profile };
  } catch {
    return { ok: false, message: 'That grading scale could not be saved.' };
  }
}

export async function createFirstClass(input: {
  name: string;
  code: string;
  level: string;
  gradingPolicyId: string;
}): Promise<StepResult> {
  const session = await requirePermission('class:read');

  const name = input.name.trim().slice(0, 120);
  const code = input.code.trim().slice(0, 24);

  if (name.length < 2) {
    return { ok: false, message: 'Give the class a name of at least two characters.' };
  }
  if (code.length === 0) {
    return { ok: false, message: 'Give the class a short code so it is easy to find later.' };
  }

  const level = input.level.trim();
  const classLevel = LEVELS.includes(level as ClassLevel) ? (level as ClassLevel) : 'k12';

  try {
    const store = await data();

    const existing = await store.listClasses(session.userId);
    if (existing.some((item) => item.code.toLowerCase() === code.toLowerCase())) {
      return { ok: false, message: `You already have a class on code ${code}.` };
    }

    const created = await store.createClass(session.userId, {
      name,
      code,
      level: classLevel,
      meetsPerWeek: 1,
    });

    // The class inherits the scale the teacher just chose, unless they said
    // otherwise on this step. Setting it here rather than leaving it null means
    // the gradebook opens on the right scale without a second trip.
    const policyId = input.gradingPolicyId.trim();
    if (policyId.length > 0) {
      await store.setClassPolicy(session.userId, created.id, policyId);
    }

    revalidatePath('/welcome');
    revalidatePath('/classes');
    return { ok: true, message: `${created.name} created.` };
  } catch {
    return { ok: false, message: 'That class could not be created.' };
  }
}