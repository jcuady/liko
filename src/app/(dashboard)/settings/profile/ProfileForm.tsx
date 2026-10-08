'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { GradingPolicyRecord, Role } from '@/lib/api/types';

import { saveProfile } from './actions';

/**
 * The profile form.
 *
 * Deliberately one form rather than a wizard here. The wizard belongs to signup,
 * where it has a job to do, which is collecting answers in an order that builds
 * context. Editing an existing profile has no such order, so a single form with
 * everything visible is the honest layout.
 *
 * Subjects are comma separated rather than a repeating field. A teacher lists
 * three to six, and a token field adds a control per subject to save four
 * keystrokes.
 */
export function ProfileForm({
  profile,
  policies,
}: {
  profile: {
    email: string;
    fullName: string;
    role: Role;
    schoolName: string;
    subjects: string[];
    defaultGradeLevel: string | null;
    gradingPolicyId: string | null;
  };
  policies: GradingPolicyRecord[];
}) {
  const [fullName, setFullName] = React.useState(profile.fullName);
  const [schoolName, setSchoolName] = React.useState(profile.schoolName);
  const [subjects, setSubjects] = React.useState(profile.subjects.join(', '));
  const [level, setLevel] = React.useState(profile.defaultGradeLevel ?? '');
  const [policyId, setPolicyId] = React.useState(profile.gradingPolicyId ?? 'percentage');

  const save = useMutation({
    mutationFn: async () => {
      const result = await saveProfile({
        fullName,
        schoolName,
        subjects,
        defaultGradeLevel: level,
        gradingPolicyId: policyId,
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => toast.success(result.message),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Your profile could not be saved.'),
  });

  const dirty =
    fullName !== profile.fullName ||
    schoolName !== profile.schoolName ||
    subjects !== profile.subjects.join(', ') ||
    level !== (profile.defaultGradeLevel ?? '') ||
    policyId !== (profile.gradingPolicyId ?? 'percentage');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-label">Email</dt>
              <dd className="mt-1.5 text-[0.9375rem] text-ink">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-label">Role</dt>
              <dd className="mt-1.5 text-[0.9375rem] capitalize text-ink">{profile.role}</dd>
            </div>
          </dl>

          <FormField id="profile-name" label="Full name" required>
            {(props) => (
              <Input
                {...props}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
              />
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teaching</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField id="profile-school" label="School or institution" hint="Optional.">
            {(props) => (
              <Input
                {...props}
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="profile-subjects"
            label="Subjects"
            hint="Separate with commas. Kept exactly as you type them."
          >
            {(props) => (
              <Input
                {...props}
                value={subjects}
                onChange={(event) => setSubjects(event.target.value)}
                placeholder="Chemistry, Environmental Science"
              />
            )}
          </FormField>

          <FormField id="profile-level" label="Level you usually teach">
            {(props) => (
              <select
                {...props}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
              >
                <option value="">Not set</option>
                <option value="preschool">Preschool</option>
                <option value="k12">K to 12</option>
                <option value="university">University</option>
              </select>
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grading</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <FormField
            id="profile-policy"
            label="Default scale"
            hint="Used when a class does not name its own. Any class can override it."
          >
            {(props) => (
              <select
                {...props}
                value={policyId}
                onChange={(event) => setPolicyId(event.target.value)}
                className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
              >
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <p className="text-meta text-ink-muted">
            Marks are always stored as a percentage. The scale only changes how they are written
            down, so changing it here never rewrites a mark.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}