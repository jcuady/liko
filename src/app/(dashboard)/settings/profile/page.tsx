import type { Metadata } from 'next';

import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '@/components/ui/feedback';
import { requireSession } from '@/lib/auth/guards';
import { UserCircleIcon } from '@phosphor-icons/react/dist/ssr';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your account details and school affiliation.',
};

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-[42rem]">
      <PageHeader title="Profile" description="Your account details." />

      <div className="rounded-[16px] border border-border bg-surface p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-label">Email</dt>
            <dd className="mt-1.5 text-[0.9375rem] text-ink">{session.email}</dd>
          </div>
          <div>
            <dt className="text-label">Role</dt>
            <dd className="mt-1.5 text-[0.9375rem] capitalize text-ink">
              {session.role}
            </dd>
          </div>
        </dl>
      </div>

      <EmptyState
        className="mt-4"
        icon={UserCircleIcon}
        title="Editing your profile is not built yet"
        description="Name, school, and role changes land with the account management work. Your current details are shown above and are accurate."
      />
    </div>
  );
}