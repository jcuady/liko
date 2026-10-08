import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { DONE, LAST, OnboardingWizard } from './OnboardingWizard';

export const metadata: Metadata = {
  title: 'Set up your workspace',
  description: 'Tell LIKO what you teach and how you grade.',
};

/**
 * First-run setup.
 *
 * Reached after registration and, deliberately, before the workspace. An empty
 * overview answers none of the questions a teacher has, and every later screen
 * has to guess. Asking here, once, is what makes the rest of the product
 * specific.
 *
 * This route is idempotent by construction rather than by a flag: it reads the
 * profile and the roster, and a teacher who has already answered these questions
 * is sent on. That means the wizard is safe to reach by URL, safe to abandon and
 * return to, and safe for a user who already had a workspace before it existed.
 * There is no "onboarded" boolean to drift out of step with reality.
 */
export default async function WelcomePage() {
  const session = await requireSession();

  // A student or guardian has no class to name and no scale to choose, so there
  // is nothing here for them to answer.
  if (session.role !== 'instructor' && session.role !== 'admin') {
    redirect('/classes');
  }

  const store = await data();
  const [profile, policies, classes] = await Promise.all([
    store.getProfile(session.userId),
    store.listPolicies(session.userId),
    store.listClasses(session.userId),
  ]);

  const hasSubjects = (profile?.subjects?.length ?? 0) > 0;
  const hasScale = Boolean(profile?.gradingPolicyId);
  const hasClass = classes.length > 0;

  /*
   * The wizard is finished when all four questions have real answers. School is
   * optional, so subjects are what decides it.
   */
  if (hasSubjects && hasScale && hasClass) {
    redirect('/overview');
  }

  /*
   * Resume where the teacher stopped rather than at the top. Each step writes as
   * it goes, so the profile is the record of progress and the index is read off
   * it. Without this, reopening `/welcome` made an interrupted setup restart from
   * the first question and re-ask things that were already answered.
   */
  const initialStep = !hasSubjects
    ? 0
    : !hasScale
      ? 1
      : hasClass
        ? DONE
        : LAST;

  return (
    <div className="pb-16 pt-6">
      <OnboardingWizard
        schoolName={profile?.schoolName ?? ''}
        subjects={profile?.subjects ?? []}
        defaultGradeLevel={profile?.defaultGradeLevel ?? null}
        gradingPolicyId={profile?.gradingPolicyId ?? null}
        policies={policies}
        hasClass={hasClass}
        initialStep={initialStep}
      />
    </div>
  );
}