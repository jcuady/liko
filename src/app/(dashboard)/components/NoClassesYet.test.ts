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

/*
 * WHY THIS BLOCK EXISTS AT ALL. The classes page had its own empty state, and
 * its own sentence: "A class holds the roster, the register, the gradebook, and
 * the plan. Create one and everything else attaches to it." That sentence is
 * better than the default, because on the classes page the thing that is
 * missing IS the class. But it was rendered to every role, and a student holds
 * `class:write` at `no` and a guardian holds `no`, so both were told to do
 * something the application would refuse them.
 *
 * The fix was to let a page bring its own creator wording, which is what
 * `creatorDescription` is. That is a door, and a door that swings the wrong way
 * brings the original defect straight back with nicer prose. So the rule is
 * asserted here rather than trusted: a custom creator sentence reaches the
 * role that can create and nobody else.
 */
describe('a page may bring its own creator wording', () => {
  const OWN = 'A class holds the roster, the register, the gradebook, and the plan. Create one and everything else attaches to it.';

  it('uses the page wording for the roles that can create', () => {
    expect(noClassesCopy('instructor', 'Classes', OWN).description).toBe(OWN);
    expect(noClassesCopy('admin', 'Classes', OWN).description).toBe(OWN);
  });

  it('never lets the page wording reach a role that cannot create', () => {
    /*
     * The load-bearing assertion of the whole change. The custom sentence
     * invites the reader to create a class, so a single leak into the
     * non-creator branch would put the original defect back, and it would be
     * back in the exact wording a page had already approved.
     */
    for (const role of ['student', 'guardian'] as const) {
      const { description } = noClassesCopy(role, 'Classes', OWN);
      expect(description, `${role} must not be given the creator wording`).not.toContain(OWN);
      expect(description).not.toMatch(/\bcreate\b/i);
    }
  });

  it('keeps the shared sentence for the roles that cannot create', () => {
    const withOwn = noClassesCopy('guardian', 'Classes', OWN).description;
    const withoutOwn = noClassesCopy('guardian', 'Classes').description;
    expect(withOwn).toBe(withoutOwn);
  });

  it('keeps the shared creator sentence when a page brings none', () => {
    expect(noClassesCopy('instructor', 'Marks').description).toBe(
      'Marks belong to a class, and you have none yet. Create one and this fills in.',
    );
  });

  it('invites creation only from a role that can create, with the page wording too', () => {
    /*
     * The same property as the default case, run over the custom sentence. A
     * creator description that did not invite would be harmless; one that
     * invited the wrong role would be the defect.
     */
    for (const role of ROLES) {
      const mayCreate = can(role, 'class:write');
      const invites = /\bcreate\b/i.test(noClassesCopy(role, 'Classes', OWN).description);
      expect(
        invites,
        `${role} can${mayCreate ? '' : 'not'} create a class, so the wording should ${mayCreate ? '' : 'not '}invite one`,
      ).toBe(mayCreate);
    }
  });
});