'use server';

/**
 * Lesson plan writes.
 *
 * WHY SERVER ACTIONS. The seam is `server-only`, so a client component cannot
 * call `saveLessonPlan` itself. The seam takes an `id` to mean update and its
 * absence to mean insert, so the caller never has to know which it is doing and
 * cannot accidentally create a duplicate by omitting a field.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import type { LessonPlanRecord } from '@/lib/api/types';

export interface PlanResult {
  ok: boolean;
  message: string;
}

/** Read path for the client cache. Goes through the seam, never a bare fetch. */
export async function loadLessonPlans(classId: string): Promise<LessonPlanRecord[]> {
  const session = await requirePermission('plan:write');
  const store = await data();
  return store.listLessonPlans(session.userId, classId);
}

export async function saveLessonPlan(input: {
  id?: string;
  classId: string;
  title: string;
  weekOf: string;
  objective: string;
  activities: string;
  standards: string;
}): Promise<PlanResult> {
  const session = await requirePermission('plan:write');

  const title = input.title.trim().slice(0, 120);
  const objective = input.objective.trim().slice(0, 600);
  const activities = input.activities.trim().slice(0, 2000);

  if (!input.classId) return { ok: false, message: 'Pick a class first.' };
  if (title.length < 2) return { ok: false, message: 'Give the plan a title.' };
  if (objective.length === 0) {
    return { ok: false, message: 'A plan needs an objective, otherwise there is nothing to teach.' };
  }
  if (input.weekOf && !/^\d{4}-\d{2}-\d{2}$/.test(input.weekOf)) {
    return { ok: false, message: 'That week could not be read.' };
  }

  const standardCodes = input.standards
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0)
    .slice(0, 20);

  try {
    const store = await data();
    await store.saveLessonPlan(session.userId, {
      // Omitting the id on an insert is what tells the seam to insert rather
      // than update, so an empty string must not be forwarded as an id.
      ...(input.id ? { id: input.id } : {}),
      classId: input.classId,
      title,
      weekOf: input.weekOf.length > 0 ? input.weekOf : null,
      body: { objective, activities },
      standardCodes,
    });
  } catch {
    return { ok: false, message: 'That plan could not be saved. Try again.' };
  }

  revalidatePath('/plan');
  return { ok: true, message: input.id ? 'Plan updated.' : 'Plan created.' };
}
