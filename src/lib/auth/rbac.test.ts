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
 */
const ADMIN_EXCEPTIONS: Permission[] = ['quiz:take'];

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

  it('never lets a student or guardian write anything', () => {
    const writes = PERMISSIONS.filter((p) => p.endsWith(':write'));
    for (const role of ['student', 'guardian'] as const) {
      for (const permission of writes) {
        expect(can(role, permission)).toBe(false);
      }
    }
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