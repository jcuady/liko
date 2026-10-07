'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { queryKeys } from '@/lib/query/keys';
import type { AssessmentType } from '@/lib/api/types';

import { createAssessment } from '@/app/(dashboard)/assess/actions';
import { ASSESSMENT_TYPES } from '@/app/(dashboard)/assess/options';

/**
 * Assessment creation, shared by the builder and the gradebook.
 *
 * WHY IT IS ONE COMPONENT. An assessment created from beside the marks it will
 * produce and one created from the builder are the same row with the same
 * rules. Two forms meant two places for the weight bounds to drift, and a
 * weight that drifts is a term total that is quietly wrong.
 *
 * A refusal from the server arrives as a resolved value, so it is checked
 * rather than toasted as a success.
 */
export function NewAssessmentDialog({
  classId,
  triggerLabel = 'New assessment',
  variant = 'secondary',
}: {
  classId: string;
  triggerLabel?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: createAssessment,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.assessments(classId) });
    },
    onError: () => toast.error('That assessment could not be created. Try again.'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <PlusIcon size={15} weight="bold" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New assessment</DialogTitle>
          <DialogDescription>
            Weight is a percentage of the final mark. Weights across a class should add up to 100
            for the term total to mean anything.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              classId,
              title: String(form.get('title') ?? ''),
              type: String(form.get('type') ?? 'quiz') as AssessmentType,
              weight: Number(form.get('weight') ?? 10),
              maxScore: Number(form.get('maxScore') ?? 100),
              dueOn: String(form.get('dueOn') ?? ''),
              standardCodes: String(form.get('standardCodes') ?? ''),
            });
          }}
        >
          <FormField id="assessment-title" label="Title" required>
            {(props) => <Input {...props} name="title" placeholder="Unit 3 quiz" />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="assessment-type" label="Type">
              {(props) => (
                <select
                  {...props}
                  name="type"
                  defaultValue="quiz"
                  className="flex h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[0.9375rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
                >
                  {ASSESSMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField id="assessment-weight" label="Weight" hint="Percentage of the final mark.">
              {(props) => (
                <Input
                  {...props}
                  name="weight"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  defaultValue={10}
                  inputMode="numeric"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="assessment-max" label="Maximum score">
              {(props) => (
                <Input
                  {...props}
                  name="maxScore"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={100}
                  inputMode="numeric"
                />
              )}
            </FormField>

            <FormField id="assessment-due" label="Due date" hint="Optional.">
              {(props) => <Input {...props} name="dueOn" type="date" />}
            </FormField>
          </div>

          <FormField
            id="assessment-standards"
            label="Standard codes"
            hint="Comma separated, for example NGSS-MS-PS1-1."
          >
            {(props) => <Input {...props} name="standardCodes" placeholder="NGSS-MS-PS1-1, CC5" />}
          </FormField>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating' : 'Create assessment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
