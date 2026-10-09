'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveQuestionSet } from '@/app/(dashboard)/assess/actions';
import { queryKeys } from '@/lib/query/keys';
import type { QuestionKind, QuestionRecord } from '@/lib/api/types';

/**
 * The question editor.
 *
 * An assessment used to be a title, a weight and a maximum, which is enough to
 * create a quiz and not enough to sit one. This is the missing half.
 *
 * WHY ONLY TWO KINDS. `single` and `multiple` are the only question types a
 * printed bubble sheet can carry, so they are the only ones offered. Offering
 * free text here would produce questions that look markable in the builder and
 * then score zero on every scan, with nothing on the scan screen to say why.
 *
 * WHY THE ANSWER KEY IS EDITED HERE AND NEVER SHOWN ON THE SCAN SCREEN. The key
 * has to exist to score anything, and it must not be on the page a teacher is
 * marking from, or that page cannot be used in front of a class.
 *
 * WHY LOCAL STATE AND ONE SAVE. The set is edited as a list, so reordering,
 * inserting and removing are all in-flight at once. Writing on every keystroke
 * would make an unfinished question briefly real, and a half-typed prompt that
 * fails validation would leave the sheet unable to save.
 */

interface DraftOption {
  key: string;
  text: string;
}

interface DraftQuestion {
  id?: string;
  kind: QuestionKind;
  prompt: string;
  options: DraftOption[];
  answerKey: string[];
  points: number;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function toDraft(question: QuestionRecord): DraftQuestion {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options.map((option) => ({ ...option })),
    answerKey: [...question.answerKey],
    points: question.points,
  };
}

function blankQuestion(): DraftQuestion {
  return {
    kind: 'single',
    prompt: '',
    options: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ],
    answerKey: [],
    points: 1,
  };
}

export function QuestionBuilder({
  assessmentId,
  assessmentTitle,
  maxScore,
}: {
  assessmentId: string;
  assessmentTitle: string;
  maxScore: number;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = React.useState<DraftQuestion[] | null>(null);

  const { data: saved = [], isLoading } = useQuery({
    queryKey: queryKeys.questions(assessmentId),
    queryFn: async () => {
      const { loadQuestions: load } = await import('@/app/(dashboard)/assess/actions');
      return load(assessmentId);
    },
  });

  // `null` means "no local edits yet", so switching assessment shows the new set
  // instead of leaving the previous one's drafts on screen. Adjusted during
  // render rather than from an effect: an effect paints one frame of the old
  // assessment's unsaved drafts against the new one first.
  const [lastAssessmentId, setLastAssessmentId] = React.useState(assessmentId);
  if (lastAssessmentId !== assessmentId) {
    setLastAssessmentId(assessmentId);
    setDrafts(null);
  }

  const rows: DraftQuestion[] = drafts ?? saved.map(toDraft);

  const save = useMutation({
    mutationFn: saveQuestionSet,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDrafts(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.questions(assessmentId) });
    },
    onError: () => toast.error('Those questions could not be saved. Try again.'),
  });

  const dirty = drafts !== null;
  const total = rows.reduce((sum, row) => sum + (Number(row.points) || 0), 0);

  const update = (index: number, patch: Partial<DraftQuestion>) => {
    setDrafts(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setDrafts(next);
  };

  const remove = (index: number) => {
    setDrafts(rows.filter((_, i) => i !== index));
  };

  const addOption = (index: number) => {
    const row = rows[index]!;
    if (row.options.length >= LETTERS.length) return;
    update(index, {
      options: [
        ...row.options,
        { key: LETTERS[row.options.length]!, text: '' },
      ],
    });
  };

  const setOption = (index: number, optionIndex: number, text: string) => {
    const row = rows[index]!;
    update(index, {
      options: row.options.map((option, i) => (i === optionIndex ? { ...option, text } : option)),
    });
  };

  const toggleAnswer = (index: number, key: string) => {
    const row = rows[index]!;
    if (row.kind === 'single') {
      update(index, { answerKey: [key] });
      return;
    }
    update(index, {
      answerKey: row.answerKey.includes(key)
        ? row.answerKey.filter((value) => value !== key)
        : [...row.answerKey, key],
    });
  };

  const removeOption = (index: number, optionIndex: number) => {
    const row = rows[index]!;
    if (row.options.length <= 2) return;
    const removed = row.options[optionIndex]!;
    update(index, {
      options: row.options.filter((_, i) => i !== optionIndex),
      // The answer key has to shrink with the options, or the server rejects
      // the save for naming a letter the question no longer has.
      answerKey: row.answerKey.filter((value) => value !== removed.key),
    });
  };

  if (isLoading) {
    return (
      <p aria-live="polite" className="text-body text-ink-muted">
        Loading questions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Questions</CardTitle>
            <p className="text-meta text-ink-muted" aria-live="polite">
              {rows.length === 0
                ? `No questions yet. ${assessmentTitle} has nothing to mark against until there are some.`
                : `${rows.length} question${rows.length === 1 ? '' : 's'} worth ${total} point${total === 1 ? '' : 's'}.`}
              {rows.length > 0 && total !== maxScore
                ? ` The assessment is set to ${maxScore}, so the sheet and the maximum disagree.`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDrafts([...rows, blankQuestion()])}
            >
              <PlusIcon size={15} weight="bold" aria-hidden="true" />
              Add question
            </Button>
            {dirty ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setDrafts(null)}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      assessmentId,
                      questions: rows.map((row) => ({
                        id: row.id,
                        kind: row.kind,
                        prompt: row.prompt,
                        options: row.options,
                        answerKey: row.answerKey,
                        points: Number(row.points) || 1,
                      })),
                    })
                  }
                >
                  {save.isPending ? 'Saving' : `Save ${rows.length || ''} questions`}
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-[16px] border border-dashed border-border bg-surface-sunken px-6 py-10 text-center text-body text-ink-muted">
              Add the first question to make this assessment scannable.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {rows.map((row, index) => {
                const complete = row.prompt.trim().length > 0 && row.answerKey.length > 0;
                return (
                  <li
                    key={row.id ?? `new-${index}`}
                    className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface-sunken p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[0.9375rem] font-medium text-ink">
                        Question {index + 1}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <label className="sr-only" htmlFor={`q-kind-${index}`}>
                          Question {index + 1} type
                        </label>
                        <select
                          id={`q-kind-${index}`}
                          value={row.kind}
                          onChange={(event) => {
                            const kind = event.target.value as QuestionKind;
                            // Switching to single keeps only the first answer,
                            // because a single-choice key with two letters is
                            // rejected on save and would fail silently until then.
                            update(index, {
                              kind,
                              answerKey: kind === 'single' ? row.answerKey.slice(0, 1) : row.answerKey,
                            });
                          }}
                          className="h-9 rounded-[10px] border border-border-strong bg-surface px-2.5 text-[0.8125rem] text-ink transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring/25"
                        >
                          <option value="single">Single choice</option>
                          <option value="multiple">Multiple select</option>
                        </select>

                        <label className="sr-only" htmlFor={`q-points-${index}`}>
                          Question {index + 1} points
                        </label>
                        <Input
                          id={`q-points-${index}`}
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={row.points}
                          onChange={(event) => update(index, { points: Number(event.target.value) })}
                          className="h-9 w-20"
                        />
                      </div>

                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Move question ${index + 1} earlier`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUpIcon size={16} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Move question ${index + 1} later`}
                          disabled={index === rows.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDownIcon size={16} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete question ${index + 1}`}
                          onClick={() => remove(index)}
                        >
                          <TrashIcon size={16} aria-hidden="true" />
                        </Button>
                      </div>

                      {complete ? (
                        <Badge tone="success">Ready to print</Badge>
                      ) : (
                        <Badge tone="warning">Needs a prompt and an answer</Badge>
                      )}
                    </div>

                    <label className="sr-only" htmlFor={`q-prompt-${index}`}>
                      Question {index + 1} prompt
                    </label>
                    <Input
                      id={`q-prompt-${index}`}
                      value={row.prompt}
                      onChange={(event) => update(index, { prompt: event.target.value })}
                      placeholder="What is the question?"
                    />

                    <ul className="flex flex-col gap-2">
                      {row.options.map((option, optionIndex) => {
                        const isAnswer = row.answerKey.includes(option.key);
                        return (
                          <li key={option.key} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAnswer(index, option.key)}
                              aria-pressed={isAnswer}
                              aria-label={`Mark option ${option.key} as the correct answer`}
                              className={
                                isAnswer
                                  ? 'size-9 shrink-0 rounded-full border-2 border-accent bg-accent transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]'
                                  : 'size-9 shrink-0 rounded-full border-2 border-border-strong bg-surface transition-colors duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-accent'
                              }
                            >
                              <span
                                className={
                                  isAnswer
                                    ? 'tabular block text-[0.75rem] font-semibold text-on-accent'
                                    : 'tabular block text-[0.75rem] font-medium text-ink-muted'
                                }
                              >
                                {option.key}
                              </span>
                            </button>

                            <label className="sr-only" htmlFor={`q-opt-${index}-${option.key}`}>
                              Option {option.key} for question {index + 1}
                            </label>
                            <Input
                              id={`q-opt-${index}-${option.key}`}
                              value={option.text}
                              onChange={(event) => setOption(index, optionIndex, event.target.value)}
                              placeholder={`Option ${option.key}`}
                            />

                            {row.options.length > 2 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove option ${option.key} from question ${index + 1}`}
                                onClick={() => removeOption(index, optionIndex)}
                              >
                                <TrashIcon size={15} aria-hidden="true" />
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>

                    {row.options.length < LETTERS.length ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="self-start"
                        onClick={() => addOption(index)}
                      >
                        <PlusIcon size={14} weight="bold" aria-hidden="true" />
                        Add option
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}