import type { Metadata } from 'next';

import { PageHeader } from '../../components/PageHeader';
import { requirePagePermission } from '@/lib/auth/guards';
import { data } from '@/lib/api/client';

import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your account details, school, subjects, and grading scale.',
};

/**
 * The profile, read through the seam.
 *
 * This used to render an "editing your profile is not built yet" placeholder.
 * It now carries the answers that make the rest of the product specific to this
 * teacher: the school they work at, what they teach, the level they usually
 * teach at, and the scale they grade on by default. The signup wizard collects
 * the same fields, so this form and the wizard share one shape rather than
 * disagreeing about what a profile is.
 *
 * Scales are read here rather than in the client so the form opens on the real
 * list instead of an empty select that fills in a frame later.
 */
export default async function ProfilePage() {
  const session = await requirePagePermission('class:read');
  const store = await data();

  const [profile, policies] = await Promise.all([
    store.getProfile(session.userId),
    store.listPolicies(session.userId),
  ]);

  return (
    <div className="mx-auto max-w-[42rem]">
      <PageHeader title="Profile" description="Your details and how LIKO should grade." />

      <ProfileForm
        profile={{
          email: profile?.email || session.email,
          // The session carries no display name, so the profile is the source.
          // Falling back to the address's local part beats an empty field a
          // teacher has to overwrite before they can save anything.
          fullName: profile?.fullName ?? session.email.split('@')[0] ?? '',
          role: profile?.role ?? session.role,
          schoolName: profile?.schoolName ?? '',
          subjects: profile?.subjects ?? [],
          defaultGradeLevel: profile?.defaultGradeLevel ?? null,
          gradingPolicyId: profile?.gradingPolicyId ?? 'percentage',
        }}
        policies={policies}
      />
    </div>
  );
}