'use server';

/**
 * Profile writes.
 *
 * A teacher states once who they are and how they grade, and the rest of the
 * product reads it. That is why these fields exist rather than being buried in
 * per-class settings: the signup wizard collects the same shape, so a teacher who
 * skips the wizard can fill in the same answers here.
 */

import { revalidatePath } from 'next/cache';

import { data } from '@/lib/api/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseSubjects } from '@/lib/profile/subjects';
import type { ClassLevel, ProfileRecord } from '@/lib/api/types';

export interface ProfileResult {
  ok: boolean;
  message: string;
  profile?: ProfileRecord;
}

const LEVELS: ClassLevel[] = ['preschool', 'k12', 'university'];

export async function saveProfile(input: {
  fullName: string;
  schoolName: string;
  subjects: string;
  defaultGradeLevel: string;
  gradingPolicyId: string;
}): Promise<ProfileResult> {
  const session = await requirePermission('class:read');

  const fullName = input.fullName.trim().slice(0, 120);
  if (fullName.length < 2) {
    return { ok: false, message: 'Your name needs at least two characters.' };
  }

  const level = input.defaultGradeLevel.trim();
  const defaultGradeLevel = LEVELS.includes(level as ClassLevel)
    ? (level as ClassLevel)
    : null;

  try {
    const store = await data();
    const profile = await store.updateProfile(session.userId, {
      fullName,
      schoolName: input.schoolName.trim().slice(0, 160),
      subjects: parseSubjects(input.subjects),
      defaultGradeLevel,
      gradingPolicyId: input.gradingPolicyId.trim() || null,
    });

    revalidatePath('/settings/profile');
    revalidatePath('/overview');
    return { ok: true, message: 'Profile saved.', profile };
  } catch {
    return { ok: false, message: 'Your profile could not be saved.' };
  }
}