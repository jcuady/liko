import type { Metadata } from 'next';

import { isPlanId, PLANS, type PlanId } from '@/app/pricing/plans';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Setup in about two minutes. No credit card is taken. Create your LIKO workspace.',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; plan?: string }>;
}) {
  const params = await searchParams;

  /*
   * `?plan=` used to arrive here and be read by nothing. Every card on the
   * pricing page links to `/register?plan=<id>`, so a visitor who compared
   * three tiers and picked one arrived at a form indistinguishable from someone
   * who had never seen the pricing page, and their choice was discarded
   * silently.
   *
   * It is validated against the same list the cards are built from rather than
   * trusted, because this is a public URL anyone can edit. An unrecognised value
   * is treated as no choice at all, which is what it is.
   *
   * The plan is shown back on the form, not written to anything yet. There is no
   * billing and no plan gating, so persisting a preference that nothing reads
   * would be its own kind of fiction.
   */
  const plan: PlanId | null = isPlanId(params.plan) ? params.plan : null;
  const chosen = plan ? PLANS.find((candidate) => candidate.id === plan) : undefined;

  return (
    <RegisterForm
      prefilledEmail={params.email ?? ''}
      chosenPlan={chosen ? { id: chosen.id, name: chosen.name } : null}
    />
  );
}