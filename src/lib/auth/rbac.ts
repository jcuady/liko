/**
 * Role-based access control.
 *
 * This matrix is the single source of truth. `src/proxy.ts` uses it to gate
 * routes before render, and `requirePermission()` uses it to gate server
 * actions and API routes. Both must consult this file, never a local copy.
 */

export const ROLES = ['instructor', 'admin', 'student', 'guardian'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'class:read',
  'class:write',
  'attendance:write',
  'plan:write',
  'assess:write',
  'grade:read',
  'grade:write',
  'analytics:read',
  'history:read',
  'user:manage',
  'org:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * `own` and `linked` are ownership scopes, not grants. They mean the caller may
 * act on records bound to their own session and nothing else. The API filter
 * resolves the accessible set from the session, so a tampered id in a URL
 * returns 404 rather than another user's data.
 */
export type Scope = 'yes' | 'no' | 'own' | 'linked';

const MATRIX: Record<Role, Record<Permission, Scope>> = {
  instructor: {
    'class:read': 'yes',
    'class:write': 'yes',
    'attendance:write': 'yes',
    'plan:write': 'yes',
    'assess:write': 'yes',
    'grade:read': 'yes',
    'grade:write': 'yes',
    'analytics:read': 'yes',
    'history:read': 'yes',
    'user:manage': 'no',
    'org:manage': 'no',
  },
  admin: {
    'class:read': 'yes',
    'class:write': 'yes',
    'attendance:write': 'yes',
    'plan:write': 'yes',
    'assess:write': 'yes',
    'grade:read': 'yes',
    'grade:write': 'yes',
    'analytics:read': 'yes',
    'history:read': 'yes',
    'user:manage': 'yes',
    'org:manage': 'yes',
  },
  student: {
    'class:read': 'own',
    'class:write': 'no',
    'attendance:write': 'no',
    'plan:write': 'no',
    'assess:write': 'no',
    'grade:read': 'own',
    'grade:write': 'no',
    'analytics:read': 'no',
    'history:read': 'own',
    'user:manage': 'no',
    'org:manage': 'no',
  },
  guardian: {
    'class:read': 'linked',
    'class:write': 'no',
    'attendance:write': 'no',
    'plan:write': 'no',
    'assess:write': 'no',
    'grade:read': 'linked',
    'grade:write': 'no',
    'analytics:read': 'no',
    'history:read': 'linked',
    'user:manage': 'no',
    'org:manage': 'no',
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function scopeFor(role: Role, permission: Permission): Scope {
  return MATRIX[role][permission];
}

/**
 * True when the role may perform the action. Ownership-scoped grants count as
 * permitted here; the ownership check itself happens against the record.
 */
export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  const scope = MATRIX[role][permission];
  return scope !== 'no';
}

/** True only for unrestricted grants, e.g. admin reading any class. */
export function isUnscoped(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role][permission] === 'yes';
}

/**
 * Route to permission map. Used by `src/proxy.ts` to decide whether a pathname
 * needs a session and which permission it demands.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: '/grades', permission: 'grade:read' },
  { prefix: '/assess', permission: 'assess:write' },
  { prefix: '/plan', permission: 'plan:write' },
  { prefix: '/attendance', permission: 'attendance:write' },
  { prefix: '/classes', permission: 'class:read' },
  { prefix: '/history', permission: 'history:read' },
  { prefix: '/analytics', permission: 'analytics:read' },
  { prefix: '/settings', permission: 'class:read' },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
  );
  return match?.permission ?? null;
}

/** Paths that always require a signed-in session, regardless of role. */
export const PROTECTED_PREFIXES = [
  '/overview',
  '/classes',
  '/attendance',
  '/plan',
  '/assess',
  '/grades',
  '/history',
  '/analytics',
  '/settings',
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Routes a signed-in visitor must never be parked on.
 *
 * `/auth/callback` and `/reset-password` are here as much as the three forms:
 * both are reached from a link in an email, and `proxy.ts` redirects any signed
 * in user away from an AUTH_PATH. Without them, clicking a confirmation link
 * while already signed in would bounce the user away before the token could be
 * consumed.
 */
export const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];