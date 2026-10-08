'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import type { GradingPolicyRecord } from '@/lib/api/types';

import { createFirstClass, saveGradingPolicy, saveOnboardingProfile } from './actions';

/**
 * Onboarding, in three questions.
 *
 * WHY THESE THREE AND NOT MORE. Every step here is a question the product cannot
 * answer for itself, and each one removes a decision from every later screen: the
 * school, what is taught, how it is graded, and the first class that ties the
 * three together. Anything else here would be the product asking questions it
 * could ask later, when the teacher has the context to answer them.
 *
 * WHY EACH STEP SAVES ON ITS OWN. A wizard that loses everything when the tab
 * closes is worse than no wizard, and a half-answered profile is still better
 * than an empty one. Progress is real progress.
 *
 * WHY IT CAN BE SKIPPED. Not everyone teaches the same way, and a teacher who
 * wants none of this can reach the workspace in one click and fill it in when it
 * matters. Forcing it would convert a first-run convenience into a wall.
 */

const STEPS = ['Teaching', 'Grading', 'First class'] as const;

/** Index of the last real step, and the sentinel for "nothing left to ask". */
export const LAST = STEPS.length - 1;
export const DONE = 99;

export function OnboardingWizard({
  schoolName,
  subjects,
  defaultGradeLevel,
  gradingPolicyId,
  policies,
  hasClass,
  initialStep,
}: {
  schoolName: string;
  subjects: string[];
  defaultGradeLevel: string | null;
  gradingPolicyId: string | null;
  policies: GradingPolicyRecord[];
  hasClass: boolean;
  /**
   * Which step the teacher had reached, worked out on the server from what they
   * have actually answered. Coming back to `/welcome` therefore resumes the
   * setup rather than restarting it, which is the difference between "we kept
   * your answers" and "we kept your place as well".
   */
  initialStep: number;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);

  const [school, setSchool] = React.useState(schoolName);
  const [subjectList, setSubjectList] = React.useState(subjects.join(', '));
  const [level, setLevel] = React.useState(defaultGradeLevel ?? '');
  const [policy, setPolicy] = React.useState(gradingPolicyId ?? 'percentage');

  const [className, setClassName] = React.useState('');
  const [classCode, setClassCode] = React.useState('');

  const saveProfileStep = useMutation({
    mutationFn: async () => {
      const result = await saveOnboardingProfile({
        schoolName: school,
        subjects: subjectList,
        defaultGradeLevel: level,
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Saved.');
      setStep(1);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Those details could not be saved.'),
  });

  /*
   * The scale is saved the moment it is chosen rather than when the wizard
   * ends. It is the answer most likely to be revisited ("actually we use GPA"),
   * and losing it to a closed tab would leave the teacher's default wrong for
   * every class they create afterwards.
   */
  const saveScaleStep = useMutation({
    mutationFn: async () => {
      const result = await saveGradingPolicy({ gradingPolicyId: policy });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => setStep(hasClass ? DONE : LAST),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'That grading scale could not be saved.',
      ),
  });

  const createClassStep = useMutation({
    mutationFn: async () => {
      const result = await createFirstClass({
        name: className,
        code: classCode,
        level: level || 'k12',
        gradingPolicyId: policy,
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      toast.success(result.message);
      router.push('/overview');
      router.refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'That class could not be created.'),
  });

  const selectedPolicy = policies.find((item) => item.id === policy);
  const busy = saveProfileStep.isPending || saveScaleStep.isPending || createClassStep.isPending;

  return (
    <div className="mx-auto flex max-w-[38rem] flex-col gap-6">
      <div>
        <p className="text-label">Step {step === DONE ? STEPS.length : step + 1} of {STEPS.length}</p>
        <h1 className="mt-2 text-h2">{step === DONE ? 'All set' : STEPS[step]}</h1>
      </div>

      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1">
            <div
              className={`h-1 rounded-full ${index <= step ? 'bg-accent' : 'bg-surface-sunken'}`}
              aria-hidden="true"
            />
            <span className="sr-only">
              {label}, {index === step ? 'current step' : index < step ? 'done' : 'not started'}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What do you teach?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              This shapes what LIKO sets up for you. You can change all of it later.
            </p>

            <FormField id="onboard-school" label="School or institution" hint="Optional.">
              {(props) => (
                <Input
                  {...props}
                  value={school}
                  onChange={(event) => setSchool(event.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="onboard-subjects"
              label="Subjects"
              hint="Separate with commas. Kept exactly as you type them."
            >
              {(props) => (
                <Input
                  {...props}
                  value={subjectList}
                  onChange={(event) => setSubjectList(event.target.value)}
                  placeholder="Chemistry, Environmental Science"
                />
              )}
            </FormField>

            <FormField id="onboard-level" label="Level you usually teach">
              {(props) => (
                <Select
                  {...props}
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="preschool">Preschool</option>
                  <option value="k12">K to 12</option>
                  <option value="university">University</option>
                </Select>
              )}
            </FormField>

            <div className="flex justify-end">
              <Button type="button" disabled={busy} onClick={() => saveProfileStep.mutate()}>
                {saveProfileStep.isPending ? 'Saving' : 'Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>How do you grade?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              Marks are always stored as a percentage. This only decides how they are written down,
              and any class can use a different one.
            </p>

            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Grading scale</legend>
              {policies.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors duration-150 ${
                    policy === option.id
                      ? 'border-accent bg-accent-subtle'
                      : 'border-border bg-surface hover:bg-surface-sunken'
                  }`}
                >
                  <input
                    type="radio"
                    name="onboarding-policy"
                    value={option.id}
                    checked={policy === option.id}
                    onChange={() => setPolicy(option.id)}
                    className="mt-1 accent-[var(--color-accent)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-[0.9375rem] text-ink">{option.name}</span>
                    <span className="text-meta text-ink-muted">
                      {option.bands.length > 0
                        ? option.bands
                            .slice(0, 4)
                            .map((band) => `${band.minPercentage}+ ${band.label}`)
                            .join(', ') + (option.bands.length > 4 ? ', ...' : '')
                        : 'Raw marks out of the assessment maximum.'}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex items-center justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" disabled={saveScaleStep.isPending} onClick={() => saveScaleStep.mutate()}>
                {saveScaleStep.isPending ? 'Saving' : 'Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === LAST ? (
        <Card>
          <CardHeader>
            <CardTitle>Your first class</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              One class is enough to start. You can add the rest once you are in.
            </p>

            <FormField id="onboard-class-name" label="Class name" required>
              {(props) => (
                <Input
                  {...props}
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="Chemistry, Period 2"
                />
              )}
            </FormField>

            <FormField
              id="onboard-class-code"
              label="Short code"
              required
              hint="Short and recognisable. You will type it a lot."
            >
              {(props) => (
                <Input
                  {...props}
                  value={classCode}
                  onChange={(event) => setClassCode(event.target.value)}
                  placeholder="CHEM-2"
                />
              )}
            </FormField>

            <p className="text-meta text-ink-muted">
              This class will be graded as {selectedPolicy?.name ?? 'percentage'}. Change it any time
              from the gradebook.
            </p>

            <div className="flex items-center justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" disabled={createClassStep.isPending} onClick={() => createClassStep.mutate()}>
                {createClassStep.isPending ? 'Creating' : 'Create class and finish'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === DONE ? (
        <Card>
          <CardHeader>
            <CardTitle>You already have a class</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              There is nothing left to set up here. New classes will use{' '}
              {gradingPolicyId
                ? `${selectedPolicy?.name ?? 'your saved scale'}`
                : 'a percentage scale until you choose one'}
              .
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => router.push('/overview')}>
                Open the workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-meta text-ink-muted">
        <Link href="/overview" className="underline underline-offset-4 hover:text-ink">
          Skip for now and open the workspace
        </Link>
      </p>
    </div>
  );
}