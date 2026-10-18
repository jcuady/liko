import { describe, expect, it } from 'vitest';

import { can, ROLES } from '@/lib/auth/rbac';

import { noClassesCopy } from './NoClassesYet';

/**
 * The empty state on a class-scoped page used to say "Create a class first" to
 * every role, including two that the permission model will not let create one:
 * a student holds `class:write` at `own` and a guardian holds `no`. So the
 * instruction was not merely wrong, it was unfollowable, and it shipped because
 * the page rendered.
 *
 * Tested through the copy function rather than through a rendered tree because
 * the decision is pure and a render harness is not what this repo has. The file
 * is `.ts` for the same reason: it contains no JSX, and the vitest include is
 * `*.test.ts`.
 */
describe('a class-scoped empty state addresses the reader it has', () => {
  it('invites creation only from a role that can create', () => {
    for (const role of ROLES) {
      const mayCreate = can(role, 'class:write');
      /*
       * `\bcreate\b` rather than the literal "Create a class", because the copy
       * says "Create one" and the point of the assertion is the invitation, not
       * a phrasing. Pinning the wording would fail on a harmless rewrite and pass
       * on a copy that invited something else entirely.
       */
      const invites = /\bcreate\b/i.test(noClassesCopy(role, 'Marks').description);
      expect(
        invites,
        `${role} can${mayCreate ? '' : 'not'} create a class, so the copy should ${mayCreate ? '' : 'not '}invite one`,
      ).toBe(mayCreate);
    }
  });

  it('gives the two roles that cannot create a different sentence', () => {
    const teacher = noClassesCopy('instructor', 'Marks');
    const guardian = noClassesCopy('guardian', 'Marks');
    const student = noClassesCopy('student', 'Marks');

    expect(guardian.description).not.toBe(teacher.description);
    expect(student.description).toBe(guardian.description);
  });

  it('names the subject it was given rather than a fixed one', () => {
    expect(noClassesCopy('instructor', 'Plans').description).toContain('Plans');
    expect(noClassesCopy('instructor', 'Assessments').description).toContain('Assessments');
  });

  it('does not claim to know why the account can see no classes', () => {
    /*
     * The reason is not knowable from here. A new teacher has made none, while
     * a guardian whose account is not linked to a roster is not permitted to
     * see one, and both reach this function with the same empty list. Copy that
     * asserts a cause would be inventing one.
     */
    const { description } = noClassesCopy('guardian', 'Marks');
    expect(description).not.toMatch(/you have no classes|you have not created/i);
    expect(description).toContain('None is linked right now');
  });
});