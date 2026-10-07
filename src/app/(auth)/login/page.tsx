import type { Metadata } from 'next';

import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your LIKO workspace.',
};

/**
 * Server component so the post-login destination is read here, where it can be
 * validated, rather than inside a client component that would force a Suspense
 * boundary and disable static rendering of the shell.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '';

  return <LoginForm next={next} />;
}