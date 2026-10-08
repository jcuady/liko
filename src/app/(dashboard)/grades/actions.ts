'use server';

/**
 * Grade writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `upsertGrade` itself. A blank cell clears a mark, which the seam models
 * as a null score rather than a deletion, so clearing works without a delete
 * endpoint that does not exist.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { validatePolicy, type GradeBand, type PolicyKind } from '@/lib/grading/policy';
import type { GradeRecord, GradingPolicyRecord } from '@/lib/api/types';

export interface GradeResult {
  ok: boolean;
  message: string;
}

export interface PolicyResult {
  ok: boolean;
  message: string;
  policy?: GradingPolicyRecord;
  /** Every problem `validatePolicy` found, so the editor can show them all. */
  problems?: string[];
}

/**
 * Read path for the client cache. Goes through the seam, never a bare fetch.
 */
export async function loadGrades(classId: string): Promise<GradeRecord[]> {
  const session = await requirePermission('grade:read');
  const store = await data();
  return store.listGrades(session.userId, classId);
}

export async function saveGrade(input: {
  assessmentId: string;
  studentId: string;
  score: number | null;
  maxScore: number;
  feedback: string;
}): Promise<GradeResult> {
  const session = await requirePermission('grade:write');

  if (!input.assessmentId || !input.studentId) {
    return { ok: false, message: 'That mark was not saved because it was not complete.' };
  }

  const maxScore = Number(input.maxScore);
  if (!Number.isFinite(maxScore) || maxScore < 1) {
    return { ok: false, message: 'This assessment has no usable maximum score.' };
  }

  // An empty cell is a deliberate clear, not a typo, so null is allowed here.
  if (input.score !== null) {
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > maxScore) {
      return {
        ok: false,
        message: `Marks run from 0 to ${maxScore} on this assessment.`,
      };
    }
  }

  const feedback = input.feedback.trim().slice(0, 1000);

  try {
    const store = await data();
    await store.upsertGrade(session.userId, {
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      score: input.score,
      maxScore,
      feedback: feedback.length > 0 ? feedback : null,
    });
  } catch {
    return { ok: false, message: 'That mark could not be saved.' };
  }

  revalidatePath('/grades');
  return { ok: true, message: 'Mark saved.' };
}

/**
 * Read path for the scale editor. Built-in scales come back with the account's
 * own, so the editor renders one list.
 */
export async function loadPolicies(): Promise<GradingPolicyRecord[]> {
  const session = await requirePermission('grade:read');
  const store = await data();
  return store.listPolicies(session.userId);
}

/**
 * Creates or updates a custom scale.
 *
 * `validatePolicy` runs here as well as inside the seam. The action reports all
 * of its problems so the editor can list them next to the offending bands, and
 * so a refusal reaches the caller as a value to display rather than an error to
 * swallow.
 */
export async function saveGradingPolicy(input: {
  id?: string;
  name: string;
  kind: PolicyKind;
  bands: GradeBand[];
}): Promise<PolicyResult> {
  const session = await requirePermission('grade:write');

  const problems = validatePolicy(input);
  if (problems.length > 0) {
    return { ok: false, message: problems[0], problems };
  }

  try {
    const store = await data();
    const policy = await store.savePolicy(session.userId, input);
    revalidatePath('/grades');
    revalidatePath('/settings/appearance');
    return {
      ok: true,
      message: input.id ? 'Scale updated.' : `Scale "${policy.name}" created.`,
      policy,
    };
  } catch {
    return { ok: false, message: 'That scale could not be saved.' };
  }
}

/** Points a class at a scale, or back to the percentage default with `null`. */
export async function setClassGradingPolicy(input: {
  classId: string;
  policyId: string | null;
}): Promise<PolicyResult> {
  const session = await requirePermission('grade:write');

  if (!input.classId) {
    return { ok: false, message: 'Pick a class before changing its scale.' };
  }

  try {
    const store = await data();
    await store.setClassPolicy(session.userId, input.classId, input.policyId);
    revalidatePath('/grades');
    return { ok: true, message: 'Scale applied to this class.' };
  } catch {
    return { ok: false, message: 'That class could not be changed.' };
  }
}
