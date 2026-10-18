import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { NoClassesYet } from '../components/NoClassesYet';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { LessonPlanner } from './LessonPlanner';

export const metadata: Metadata = {
  title: 'Lesson plans',
  description: 'Plan the week while it is still cheap to change.',
};

/**
 * Lesson plans, read through the seam.
 *
 * `listLessonPlans` is scoped to one class, so the page renders the first class
 * the teacher owns and the planner switches between them.
 */
export default async function PlanPage() {
  const session = await requirePagePermission('plan:write');

  const store = await data();
  const classes = await store.listClasses(session.userId);

  if (classes.length === 0) {
    return (
      <div className="mx-auto max-w-[64rem]">
        <PageHeader
          title="Lesson plans"
          description="Plan the week while it is still cheap to change."
        />
        <NoClassesYet role={session.role} subject="Plans" />
      </div>
    );
  }

  const selected = classes[0];
  const plans = await store.listLessonPlans(session.userId, selected.id);

  return (
    <div className="mx-auto max-w-[64rem]">
      <PageHeader
        title="Lesson plans"
        description="Plan the week while it is still cheap to change."
      />
      <LessonPlanner
        classes={classes.map((item) => ({ id: item.id, name: item.name }))}
        classId={selected.id}
        plans={plans}
      />
    </div>
  );
}
