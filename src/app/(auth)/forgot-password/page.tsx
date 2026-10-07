import type { Metadata } from 'next';

import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your LIKO account.',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}