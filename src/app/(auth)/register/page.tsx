import type { Metadata } from 'next';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Start your free trial',
  description:
    'No credit card required. Setup in 2 minutes. Create your LIKO workspace.',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;

  return <RegisterForm prefilledEmail={params.email ?? ''} />;
}