import type { Metadata } from 'next';

import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your LIKO account.',
};

/**
 * Reached from the link in a reset email.
 *
 * Listed in `AUTH_PATHS` so `proxy.ts` does not redirect a signed-in user off
 * this page before the recovery session can be used.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}