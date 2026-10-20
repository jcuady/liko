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
 *
 * WHY A PAGE MAY BRING ITS OWN CREATOR WORDING. The default sentence is
 * "Marks belong to a class, and you have none yet. Create one and this fills
 * in." That reads for a subject which hangs off a class. The classes page is
 * the one page where the thing that is missing IS the class, so it had its own
 * sentence already, and the sentence was better than the default: it says what
 * a class carries. `creatorDescription` lets that page keep its wording for
 * the role that can create one and still fall back to the shared sentence for
 * the role that cannot.
 *
 * THE ONE RULE THIS PROP HAS. It is used in the creator branch and nowhere
 * else, because the creator branch is the only one permitted to invite. If it
 * reached the non-creator branch then a page wanting a nicer sentence would
 * have undone the entire component, and the defect this was written for would
 * be back with a paragraph nobody could account for. `NoClassesYet.test.ts`
 * holds that line: the custom sentence is asserted to be absent from the
 * guardian's and the student's copy.
 */
export function noClassesCopy(
  role: Role | undefined,
  subject: string,
  creatorDescription?: string,
) {
  const mayCreate = can(role, 'class:write');

  return {
    title: 'No classes yet',
    description: mayCreate
      ? (creatorDescription ??
        `${subject} belong to a class, and you have none yet. Create one and this fills in.`)
      : // States the fact and stops. Not a diagnosis: a new teacher has made no
        // class, while a guardian whose account is not linked to a roster is not
        // permitted to see one, and both arrive here identically.
        `${subject} appear here once this account is linked to a class. None is linked right now, so ask the school to add one.`,
  };
}

export function NoClassesYet({
  role,
  subject,
  creatorDescription,
}: {
  role: Role | undefined;
  subject: string;
  creatorDescription?: string;
}) {
  const copy = noClassesCopy(role, subject, creatorDescription);

  return <EmptyState icon={School} title={copy.title} description={copy.description} />;
}