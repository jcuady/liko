import { School } from 'lucide-react';

import { EmptyState } from '@/components/ui/feedback';
import { can, type Role } from '@/lib/auth/rbac';

/**
 * What a class-scoped page shows when this account can see no classes.
 *
 * WHY THIS EXISTS AS A COMPONENT. `/grades`, `/assess` and `/plan` each
 * hand-rolled the same paragraph, and all three said "Create a class first".
 * That is an instruction to a role that cannot carry it out: a guardian holds
 * `class:write: 'no'` and a student holds `own`, so both were told to do
 * something the application would refuse them. The `EmptyState` component
 * already exists for this and three pages were not using it, which is how the
 * copy drifted apart from the permission model in the first place.
 *
 * WHAT THE COPY IS NOT ALLOWED TO DO. It must not diagnose. "No classes yet" is
 * a statement about what the account can read, and the reason it can read none
 * is not always the same thing: a new teacher has not made one, while a
 * guardian whose account is not linked to a child's roster is not permitted to
 * see one. Both render identically from here. So the non-creator branch states
 * the fact and gives the honest next step, and stops there.
 */
export function noClassesCopy(role: Role | undefined, subject: string) {
  const mayCreate = can(role, 'class:write');

  return {
    title: 'No classes yet',
    description: mayCreate
      ? `${subject} belong to a class, and you have none yet. Create one and this fills in.`
      : // States the fact and stops. Not a diagnosis: a new teacher has made no
        // class, while a guardian whose account is not linked to a roster is not
        // permitted to see one, and both arrive here identically.
        `${subject} appear here once this account is linked to a class. None is linked right now, so ask the school to add one.`,
  };
}

export function NoClassesYet({ role, subject }: { role: Role | undefined; subject: string }) {
  const copy = noClassesCopy(role, subject);

  return <EmptyState icon={School} title={copy.title} description={copy.description} />;
}