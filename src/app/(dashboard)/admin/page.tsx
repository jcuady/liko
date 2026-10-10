import type { Metadata } from 'next';

import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '@/components/ui/feedback';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';
import { PERMISSIONS, ROLES, scopeFor, type Permission, type Role } from '@/lib/auth/rbac';
import type { ClassRecord, MemberRecord, OrgRecord } from '@/lib/api/types';

import { AdminConsole } from './AdminConsole';

export const metadata: Metadata = {
  title: 'Administration',
  description: 'People, classes, grading and access for your organisation.',
};

const ROLE_LABELS: Record<Role, string> = {
  instructor: 'Teacher',
  admin: 'Administrator',
  student: 'Student',
  guardian: 'Parent or guardian',
};

const PERMISSION_LABELS: Record<Permission, string> = {
  'class:read': 'View classes',
  'class:write': 'Create and archive classes',
  'attendance:write': 'Take attendance',
  'plan:write': 'Write lesson plans',
  'assess:write': 'Create assessments',
  'grade:read': 'View grades',
  'grade:write': 'Record grades',
  'quiz:take': 'Sit a quiz',
  'analytics:read': 'View the overview',
  'history:read': 'View student history',
  'user:manage': 'Manage people',
  'org:manage': 'Manage the organisation',
};

/**
 * Administration.
 *
 * One page for the four things an administrator actually has to be able to do:
 * see who is in the organisation, change what each of them may do, change the
 * organisation's own settings, and understand the access model the product
 * enforces rather than guessing at it.
 *
 * The last one is why the permission matrix is rendered from `rbac.ts` instead
 * of being written out again here. A hand-written copy of that table is a table
 * that will be wrong within a release, and it is exactly the kind of document an
 * administrator trusts.
 */
export default async function AdminPage() {
  const session = await requirePagePermission('org:manage');
  const store = await data();

  const [org, members, classes, profile] = await Promise.all([
    store.getOrg(session.userId),
    store.listMembers(session.userId),
    store.listClasses(session.userId),
    store.getProfile(session.userId),
  ]);

  return (
    <div className="pb-16">
      <PageHeader
        title="Administration"
        description="Who is in this workspace, what each person may do, and how the organisation is set up."
      />

      {org ? (
        <AdminConsole
          org={org}
          members={members}
          classes={classes}
          viewerId={session.userId}
          viewerName={profile?.fullName || session.email}
          roleLabels={ROLE_LABELS}
          matrix={ROLES.map((role) => ({
            role,
            label: ROLE_LABELS[role],
            grants: PERMISSIONS.map((permission) => ({
              permission,
              label: PERMISSION_LABELS[permission],
              scope: scopeFor(role, permission),
            })),
          }))}
        />
      ) : (
        <EmptyState
          title="No organisation yet"
          description="This account is not part of an organisation, so there is nothing to administer."
        />
      )}
    </div>
  );
}

export type AdminOrg = OrgRecord;
export type AdminMember = MemberRecord;
export type AdminClass = ClassRecord;