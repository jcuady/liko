'use server';

/**
 * Assessment writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `createAssessment` itself. This module is also imported by the gradebook
 * route, so the weight and type rules hold whether an assessment is created
 * from the builder or from beside the marks it will produce.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { AssessmentRecord, AssessmentType } from '@/lib/api/types';
import { isAssessmentType } from './options';

export interface AssessmentResult {
  ok: boolean;
  message: string;
}

/**
 * Read path for the client cache. Goes through the seam, never a bare fetch.
 */
export async function loadAssessments(classId: string): Promise<AssessmentRecord[]> {
  const session = await requirePermission('assess:write');
  const store = await data();
  return store.listAssessments(session.userId, classId);
}

export async function createAssessment(input: {
  classId: string;
  title: string;
  type: AssessmentType;
  weight: number;
  maxScore: number;
  dueOn: string;
  standardCodes: string;
}): Promise<AssessmentResult> {
  const session = await requirePermission('assess:write');

  const title = input.title.trim().slice(0, 120);
  const weight = Number(input.weight);
  const maxScore = Number(input.maxScore);

  if (!input.classId) return { ok: false, message: 'Pick a class first.' };
  if (title.length < 2) return { ok: false, message: 'Give the assessment a title.' };
  if (!isAssessmentType(input.type)) {
    return { ok: false, message: 'That assessment type is not one this app supports.' };
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { ok: false, message: 'Weight must be greater than 0 and at most 100.' };
  }
  if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) {
    return { ok: false, message: 'Maximum score must be between 1 and 1000.' };
  }
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) {
    return { ok: false, message: 'That due date could not be read.' };
  }

  const standardCodes = input.standardCodes
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0)
    .slice(0, 20);

  try {
    const store = await data();
    await store.createAssessment(session.userId, {
      classId: input.classId,
      title,
      type: input.type,
      weight,
      maxScore,
      dueOn: input.dueOn.length > 0 ? input.dueOn : null,
      standardCodes,
    });
  } catch {
    return { ok: false, message: 'That assessment could not be created. Try again.' };
  }

  revalidatePath('/assess');
  revalidatePath('/grades');
  return { ok: true, message: `${title} created.` };
}
