'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { queryKeys } from '@/lib/query/keys';
import { validatePolicy, type GradeBand } from '@/lib/grading/policy';
import type { GradingPolicyRecord } from '@/lib/api/types';

import { saveGradingPolicy } from '@/app/(dashboard)/grades/actions';

/**
 * The scale editor.
 *
 * Lets a teacher define a grading system the product did not ship. The five
 * built-ins cover the common cases, but a departmental scale, a UK degree class,
 * or a points scheme a college invented are all the same shape: a descending list
 * of bands, each with a label and optionally a grade point.
 *
 * Validation runs in the policy engine, which is the only place that knows what
 * makes a scale usable, and it runs here as well as in the action so the editor
 * can list every problem instead of revealing them one reload at a time.
 */

interface DraftBand {
  minPercentage: string;
  label: string;
  gradePoint: string;
}

function fromDraft(drafts: DraftBand[]): GradeBand[] {
  return drafts.map((draft) => {
    const point = draft.gradePoint.trim();
    const parsed = Number(point);
    return {
      minPercentage: Number(draft.minPercentage),
      label: draft.label.trim(),
      gradePoint: point.length === 0 || !Number.isFinite(parsed) ? null : parsed,
    };
  });
}

/** A useful starting point: Distinction, Pass, Refer. */
const STARTER: DraftBand[] = [
  { minPercentage: '75', label: 'Distinction', gradePoint: '4' },
  { minPercentage: '50', label: 'Pass', gradePoint: '2' },
  { minPercentage: '0', label: 'Refer', gradePoint: '0' },
];

export function ScaleEditorDialog({
  policies,
  onCreated,
}: {
  policies: GradingPolicyRecord[];
  onCreated: (policy: GradingPolicyRecord) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [drafts, setDrafts] = React.useState<DraftBand[]>(STARTER);

  // Validation is derived, not stored, so the problems disappear the moment the
  // teacher fixes them rather than needing a second submit.
  const problems = React.useMemo(
    () =>
      validatePolicy({
        name,
        kind: 'custom',
        bands: fromDraft(drafts),
      }),
    [drafts, name],
  );

  const create = useMutation({
    mutationFn: async () => {
      const result = await saveGradingPolicy({
        name: name.trim(),
        kind: 'custom',
        bands: fromDraft(drafts),
      });
      if (!result.ok) throw new Error(result.problems?.join(' ') ?? result.message);
      return result;
    },
    onSuccess: (result) => {
      if (result.policy) {
        onCreated(result.policy);
        toast.success(result.message);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.policies() });
      setOpen(false);
      setName('');
      setDrafts(STARTER);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'That scale could not be saved.'),
  });

  const authored = policies.filter((policy) => !policy.builtIn);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          New scale
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a grading scale</DialogTitle>
          <DialogDescription>
            Bands run from the highest mark down. The lowest band must start at 0, or some marks
            would have no band at all. A grade point is optional; leave it empty on a scale that
            is only labels.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (problems.length === 0) create.mutate();
          }}
        >
          <FormField id="scale-name" label="Scale name" required>
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Distinction, Pass, Refer"
              />
            )}
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-label">Bands</legend>

            {drafts.map((draft, index) => (
              <div key={index} className="grid grid-cols-[5.5rem_1fr_5rem_auto] items-end gap-2">
                <FormField id={`scale-band-min-${index}`} label={index === 0 ? 'From %' : ''}>
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="numeric"
                      value={draft.minPercentage}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((band, position) =>
                            position === index
                              ? { ...band, minPercentage: event.target.value }
                              : band,
                          ),
                        )
                      }
                    />
                  )}
                </FormField>

                <FormField id={`scale-band-label-${index}`} label={index === 0 ? 'Label' : ''} required>
                  {(props) => (
                    <Input
                      {...props}
                      value={draft.label}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((band, position) =>
                            position === index ? { ...band, label: event.target.value } : band,
                          ),
                        )
                      }
                    />
                  )}
                </FormField>

                <FormField id={`scale-band-point-${index}`} label={index === 0 ? 'Point' : ''}>
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="decimal"
                      value={draft.gradePoint}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((band, position) =>
                            position === index ? { ...band, gradePoint: event.target.value } : band,
                          ),
                        )
                      }
                    />
                  )}
                </FormField>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove band ${draft.label || index + 1}`}
                  disabled={drafts.length <= 2}
                  onClick={() =>
                    setDrafts((current) => current.filter((_, position) => position !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}

            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDrafts((current) => [
                    ...current,
                    { minPercentage: '0', label: '', gradePoint: '' },
                  ])
                }
              >
                Add band
              </Button>
            </div>
          </fieldset>

          {problems.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-[12px] border border-danger/30 bg-danger-subtle p-3">
              {problems.map((problem) => (
                <li key={problem} className="text-meta text-danger">
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}

          {authored.length > 0 ? (
            <p className="text-meta text-ink-muted">
              You have {authored.length} custom {authored.length === 1 ? 'scale' : 'scales'}:{' '}
              {authored.map((policy) => policy.name).join(', ')}.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={problems.length > 0 || create.isPending}>
              {create.isPending ? 'Saving' : 'Create scale'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}