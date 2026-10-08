'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { NotePencilIcon, PlusIcon } from '@phosphor-icons/react';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
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
import type { LessonPlanRecord } from '@/lib/api/types';

import { loadLessonPlans, saveLessonPlan } from './actions';

/**
 * The lesson planner.
 *
 * Plan bodies are stored as a loose record, so the objective and the activities
 * are read back through narrow accessors rather than a cast. A body written by
 * an older version of this app may not have both keys, and rendering
 * `undefined` into a heading is how a planner ends up claiming a lesson has no
 * objective when it simply predates the field.
 */

function readField(body: LessonPlanRecord['body'], key: string): string {
  const value = body?.[key];
  return typeof value === 'string' ? value : '';
}

interface Draft {
  id?: string;
  title: string;
  weekOf: string;
  objective: string;
  activities: string;
  standards: string;
}

const EMPTY: Draft = {
  title: '',
  weekOf: '',
  objective: '',
  activities: '',
  standards: '',
};

function toDraft(plan: LessonPlanRecord): Draft {
  return {
    id: plan.id,
    title: plan.title,
    weekOf: plan.weekOf ?? '',
    objective: readField(plan.body, 'objective'),
    activities: readField(plan.body, 'activities'),
    standards: plan.standardCodes.join(', '),
  };
}

export function LessonPlanner({
  classes,
  classId,
  plans,
}: {
  classes: { id: string; name: string }[];
  classId: string;
  plans: LessonPlanRecord[];
}) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = React.useState(classId);
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const effectiveClassId = classes.some((item) => item.id === selectedClassId)
    ? selectedClassId
    : classId;

  const planKey = queryKeys.lessonPlans(effectiveClassId);

  const { data: rows = plans } = useQuery({
    queryKey: planKey,
    queryFn: () => loadLessonPlans(effectiveClassId),
    initialData: plans,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: saveLessonPlan,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: planKey });
    },
    onError: () => toast.error('That plan could not be saved. Try again.'),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FormField id="plan-class" label="Class" className="min-w-[14rem]">
          {(props) => (
            <Select
              {...props}
              value={effectiveClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <PlanDialog
          classId={effectiveClassId}
          draft={EMPTY}
          onSave={(draft) => mutation.mutate({ ...draft, classId: effectiveClassId })}
          saving={mutation.isPending}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center text-body text-ink-muted">
          No plans for this class yet. A plan holds the objective, the activities, and the standard
          codes the lesson is meant to hit.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((plan) => (
            <li key={plan.id}>
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0">
                    <CardTitle>{plan.title}</CardTitle>
                    <p className="text-meta text-ink-muted">
                      {plan.weekOf ? `Week of ${plan.weekOf}` : 'No week set'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(toDraft(plan))}
                    className="shrink-0"
                  >
                    <NotePencilIcon size={15} weight="bold" aria-hidden="true" />
                    Edit
                    <span className="sr-only"> {plan.title}</span>
                  </Button>
                </CardHeader>

                <CardContent>
                  <p className="text-body text-ink">
                    <span className="font-medium">Objective. </span>
                    {readField(plan.body, 'objective') || 'Not recorded.'}
                  </p>
                  {readField(plan.body, 'activities') ? (
                    <p className="mt-2 whitespace-pre-line text-body text-ink-muted">
                      {readField(plan.body, 'activities')}
                    </p>
                  ) : null}
                  {plan.standardCodes.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {plan.standardCodes.map((code) => (
                        <li key={code}>
                          <Badge tone="neutral">{code}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <PlanDialog
          open
          classId={effectiveClassId}
          draft={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSave={(draft) => mutation.mutate({ ...draft, classId: effectiveClassId })}
          saving={mutation.isPending}
        />
      ) : null}
    </div>
  );
}

function PlanDialog({
  classId,
  draft,
  onSave,
  saving,
  open,
  onOpenChange,
}: {
  classId: string;
  draft: Draft;
  onSave: (draft: Draft) => void;
  saving: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEdit = Boolean(draft.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {onOpenChange ? null : (
        <DialogTrigger asChild>
          <Button size="sm">
            <PlusIcon size={15} weight="bold" aria-hidden="true" />
            New lesson plan
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lesson plan' : 'New lesson plan'}</DialogTitle>
          <DialogDescription>
            The objective is what the lesson is judged against, so it is the one field that is
            required.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSave({
              ...draft,
              title: String(form.get('title') ?? ''),
              weekOf: String(form.get('weekOf') ?? ''),
              objective: String(form.get('objective') ?? ''),
              activities: String(form.get('activities') ?? ''),
              standards: String(form.get('standards') ?? ''),
              id: draft.id,
            });
          }}
        >
          <FormField id={`plan-title-${draft.id ?? classId}`} label="Title" required>
            {(props) => (
              <Input {...props} name="title" defaultValue={draft.title} placeholder="Cell division" />
            )}
          </FormField>

          <FormField id={`plan-week-${draft.id ?? classId}`} label="Week of" hint="Optional.">
            {(props) => (
              <Input {...props} name="weekOf" type="date" defaultValue={draft.weekOf} />
            )}
          </FormField>

          <FormField id={`plan-objective-${draft.id ?? classId}`} label="Objective" required>
            {(props) => (
              <Textarea
                {...props}
                name="objective"
                rows={3}
                defaultValue={draft.objective}
                placeholder="Students can describe the stages of mitosis and why each stage matters."
              />
            )}
          </FormField>

          <FormField id={`plan-activities-${draft.id ?? classId}`} label="Activities">
            {(props) => (
              <Textarea
                {...props}
                name="activities"
                rows={5}
                defaultValue={draft.activities}
                placeholder="Starter recall, model build in pairs, independent check."
              />
            )}
          </FormField>

          <FormField
            id={`plan-standards-${draft.id ?? classId}`}
            label="Standard codes"
            hint="Comma separated, for example NGSS-MS-LS1-1."
          >
            {(props) => (
              <Input {...props} name="standards" defaultValue={draft.standards} />
            )}
          </FormField>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => onOpenChange?.(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving' : isEdit ? 'Save changes' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
