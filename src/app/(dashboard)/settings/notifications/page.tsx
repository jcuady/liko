import type { Metadata } from 'next';

import { PageHeader } from '../../components/PageHeader';
import { PushToggle } from './PushToggle';
import { requireSession } from '@/lib/auth/guards';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Choose whether LIKO can reach you outside the workspace.',
};

export default async function NotificationsPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-[42rem]">
      <PageHeader
        title="Notifications"
        description="LIKO can only interrupt you about a student who needs attention. Nothing else is sent."
      />

      <div className="rounded-[16px] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[34rem]">
            <h2 className="text-[1.0625rem] font-medium text-ink">Push notifications</h2>
            <p className="mt-1 text-[0.875rem] text-ink-muted">
              Turning this on subscribes this device. Other devices stay as they are.
            </p>
          </div>
          <PushToggle />
        </div>
      </div>

      <div className="mt-4 rounded-[16px] border border-border bg-surface p-5">
        <h2 className="text-[1.0625rem] font-medium text-ink">What arrives</h2>
        <dl className="mt-4 grid gap-4">
          <div>
            <dt className="text-label">At-risk digest</dt>
            <dd className="mt-1.5 text-[0.9375rem] text-ink">
              Once a day, only when a student drops below the threshold on class
              average or misses several sessions. A student is listed at most once
              a week.
            </dd>
          </div>
          <div>
            <dt className="text-label">Grade and attendance summary</dt>
            <dd className="mt-1.5 text-[0.9375rem] text-ink">
              Marks entered and absences recorded across your classes.
            </dd>
          </div>
          <div>
            <dt className="text-label">Nothing else</dt>
            <dd className="mt-1.5 text-[0.9375rem] text-ink">
              No reminders for your own tasks, no marketing, and no email. If you
              would rather hear nothing at all, turn the switch off and LIKO stops
              holding an endpoint for this device.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}