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
import type { GradeRecord } from '@/lib/api/types';

export interface GradeResult {
  ok: boolean;
  message: string;
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
