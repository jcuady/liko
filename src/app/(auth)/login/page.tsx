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
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '';

  /*
   * `?reset=1` is written by `resetPasswordAction` after a password is changed.
   * It used to arrive here and be read by nothing at all, which left the person
   * who had just reset their password staring at an ordinary sign-in form with
   * no word that it had worked.
   */
  return <LoginForm next={next} passwordReset={params.reset === '1'} />;
}