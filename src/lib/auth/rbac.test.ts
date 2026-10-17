import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTH_PATHS,
  PERMISSIONS,
  ROLES,
  can,
  isProtectedPath,
  isRole,
  isUnscoped,
  permissionForPath,
  scopeFor,
  type Permission,
} from './rbac';

/**
 * Permissions an administrator does not hold, with the reason beside each one so
 * the list cannot grow by accident.
 *
 * Both exceptions are capabilities that write *on behalf of a child*. A quiz
 * writes a mark into a gradebook; a review writes a schedule row belonging to a
 * student. Neither is an edit of staff's own work, so neither is an
 * administrator's to perform.
 */
const ADMIN_EXCEPTIONS: Permission[] = ['quiz:take', 'flashcard:review'];

describe('role matrix', () => {
  it('covers every role and permission without gaps', () => {
    for (const role of ROLES) {
      for (const permission of PERMISSIONS) {
        expect(scopeFor(role, permission)).toMatch(/^(yes|no|own|linked)$/);
      }
    }
  });

  it('gives instructors every teaching permission and no admin ones', () => {
    expect(can('instructor', 'class:read')).toBe(true);
    expect(can('instructor', 'grade:write')).toBe(true);
    expect(can('instructor', 'attendance:write')).toBe(true);
    expect(can('instructor', 'user:manage')).toBe(false);
    expect(can('instructor', 'org:manage')).toBe(false);
  });

  it('gives administrators everything', () => {
    for (const permission of PERMISSIONS) {
      // `quiz:take` is the one deliberate exception, and it is enumerated rather
      // than carved out below, so that adding a second exception fails this test
      // instead of quietly becoming normal.
      if (ADMIN_EXCEPTIONS.includes(permission)) continue;
      expect(can('admin', permission)).toBe(true);
      expect(isUnscoped('admin', permission)).toBe(true);
    }
  });

  it('refuses to let an administrator sit a quiz on a child record', () => {
    /*
     * Every other permission is a read or an edit of work staff did themselves.
     * Sitting a quiz writes a mark against a student, from an account that is
     * not that student, which would let a mark appear in a class gradebook
     * without the teacher knowing it happened.
     */
    for (const permission of ADMIN_EXCEPTIONS) {
      expect(can('admin', permission)).toBe(false);
      expect(isUnscoped('admin', permission)).toBe(false);
    }
  });

  it('keeps every teaching role off the quiz-taking route', () => {
    // Teachers write quizzes at /assess. Letting them sit one as well would put
    // a second, unmarked copy of the answers in front of whoever marks it.
    expect(can('instructor', 'quiz:take')).toBe(false);
    expect(can('admin', 'quiz:take')).toBe(false);
    expect(can('guardian', 'quiz:take')).toBe(false);
    expect(scopeFor('student', 'quiz:take')).toBe('own');
  });

  it('never lets a student or guardian write anything they do not own', () => {
    /*
     * This was a blanket rule: no `:write` permission for either role. It was
     * true while every writable record belonged to a teacher, and it is now
     * narrowed rather than deleted, because the property worth protecting is not
     * "students never write" but "students never write somebody else's record".
     *
     * A blanket version cannot express a student's own study deck, and the
     * tempting fix — exempting the new permission from the loop — would have
     * left the original rule silently unenforced for it too.
     */
    const writes = PERMISSIONS.filter((p) => p.endsWith(':write'));
    for (const permission of writes) {
      // A guardian holds no write at all. Everything a guardian reaches belongs
      // to a child, so there is no "own" for them to write within.
      expect(can('guardian', permission), `guardian ${permission}`).toBe(false);

      const scope = scopeFor('student', permission);
      if (scope === 'no') continue;
      // `own` only. `yes` would reach any record in the school; `linked`
      // would reach a child's.
      expect(scope, `student ${permission}`).toBe('own');
    }
  });

  it('lets a student write their own flashcards and nothing else', () => {
    expect(scopeFor('student', 'flashcard:write')).toBe('own');
    expect(can('guardian', 'flashcard:write')).toBe(false);
  });

  it('never gives a student or guardian an unscoped grant', () => {
    for (const role of ['student', 'guardian'] as const) {
      for (const permission of PERMISSIONS) {
        expect(isUnscoped(role, permission), `${role} ${permission}`).toBe(false);
      }
    }
  });

  it('keeps review a student capability', () => {
    // Review writes a schedule row belonging to a student, and only a student
    // owns a roster row. Staff author a deck; they do not sit one.
    expect(can('student', 'flashcard:review')).toBe(true);
    expect(can('guardian', 'flashcard:review')).toBe(false);
    expect(can('instructor', 'flashcard:review')).toBe(false);
    expect(can('admin', 'flashcard:review')).toBe(false);
  });

  it('scopes student and guardian reads to ownership', () => {
    expect(scopeFor('student', 'grade:read')).toBe('own');
    expect(scopeFor('guardian', 'grade:read')).toBe('linked');
    expect(scopeFor('student', 'class:read')).toBe('own');
    expect(scopeFor('guardian', 'history:read')).toBe('linked');
  });

  it('denies everything to a missing role', () => {
    for (const permission of PERMISSIONS) {
      expect(can(undefined, permission)).toBe(false);
      expect(isUnscoped(undefined, permission)).toBe(false);
    }
  });
});

describe('isRole', () => {
  it('accepts known roles', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
  });

  it('rejects anything else, including case variants and objects', () => {
    for (const value of ['Instructor', 'teacher', '', null, undefined, 42, {}]) {
      expect(isRole(value)).toBe(false);
    }
  });
});

describe('route mapping', () => {
  it('maps each protected prefix to a permission', () => {
    expect(permissionForPath('/grades')).toBe('grade:read');
    expect(permissionForPath('/assess')).toBe('assess:write');
    expect(permissionForPath('/plan')).toBe('plan:write');
    expect(permissionForPath('/classes/cls_1')).toBe('class:read');
  });

  it('matches nested paths but not prefix collisions', () => {
    expect(permissionForPath('/grades/term-1')).toBe('grade:read');
    // "/gradesarchive" must not match the "/grades" prefix.
    expect(permissionForPath('/gradesarchive')).toBeNull();
  });

  it('requires a session on every workspace path', () => {
    expect(isProtectedPath('/overview')).toBe(true);
    expect(isProtectedPath('/grades')).toBe(true);
    expect(isProtectedPath('/settings/profile')).toBe(true);
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/offline')).toBe(false);
  });

  it('keeps auth paths separate from protected paths', () => {
    for (const path of AUTH_PATHS) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });
});

/**
 * Completeness, which the assertions above cannot express.
 *
 * Every one of them names a path by hand, so all twenty-one of them stay green
 * when a twenty-second route is added and nobody remembers the list. That is how
 * `/forbidden` ended up outside `PROTECTED_PREFIXES` while living inside the
 * `(dashboard)` group like the other twenty.
 *
 * It is currently caught by the dashboard layout's own `requireSession()`, so it
 * is not an anonymous hole today. It is a page that relies on a second gate
 * having nothing to do with the proxy, which is exactly the kind of dependency
 * that disappears the moment somebody moves the file.
 *
 * The list is read from disk rather than restated here on purpose. A test that
 * repeats the list can only prove the list agrees with itself.
 */
describe('the workspace group and the proxy agree about what needs a session', () => {
  const dashboardRoot = join(process.cwd(), 'src', 'app', '(dashboard)');

  function pageRoutes(dir: string, prefix = ''): string[] {
    const routes: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        routes.push(...pageRoutes(path, `${prefix}/${entry.name}`));
      } else if (entry.name === 'page.tsx') {
        routes.push(prefix || '/');
      }
    }
    return routes;
  }

  const routes = existsSync(dashboardRoot) ? pageRoutes(dashboardRoot).sort() : [];

  it('finds the workspace pages, so an empty walk cannot read as a pass', () => {
    // A directory walk that matches nothing would make the assertion below
    // vacuously true, which is the one way this gate could report a clean bill
    // of health for a renamed group.
    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toContain('/classes');
  });

  it('puts every workspace page behind the proxy', () => {
    const unprotected = routes.filter((route) => !isProtectedPath(route));
    expect(
      unprotected,
      `these pages live in (dashboard) but are not in PROTECTED_PREFIXES: ${unprotected.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * Writing is not reading.
 *
 * WHY THIS GROUP EXISTS. Three handlers wrote while holding a READ grant:
 * `addBehaviourLog` on `history:read`, and `createFirstClass` and `saveProfile`
 * on `class:read`. A student holds both of those at scope `own` and a guardian
 * at `linked`, and `can()` deliberately counts an ownership scope as permitted,
 * so the checks passed and the writes went through.
 *
 * The assertions below are deliberately about the DENIAL rather than the grant.
 * Asserting only that a teacher may write something would still pass with the
 * matrix cell set to `own`, which is the shape the bug had.
 */
describe('write grants are separate from read grants', () => {
  it('refuses a behaviour note to a student and a guardian', () => {
    expect(can('student', 'history:write')).toBe(false);
    expect(can('guardian', 'history:write')).toBe(false);
  });

  it('allows a behaviour note to staff', () => {
    expect(can('instructor', 'history:write')).toBe(true);
    expect(can('admin', 'history:write')).toBe(true);
  });

  it('still lets a student read their own history', () => {
    // The fix must not have closed the read the student legitimately has.
    expect(can('student', 'history:read')).toBe(true);
    expect(scopeFor('student', 'history:read')).toBe('own');
  });

  it('refuses class creation to a student and a guardian', () => {
    // `createFirstClass` used to require `class:read`, which both hold.
    expect(can('student', 'class:write')).toBe(false);
    expect(can('guardian', 'class:write')).toBe(false);
  });
});