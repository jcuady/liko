'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  SLIDE_LAYOUTS,
  SLIDE_LAYOUT_LABELS,
  type DeckRecord,
  type SlideLayout,
  type SlideRecord,
} from '@/lib/api/types';

import {
  createSlideAction,
  deleteSlideAction,
  moveSlideAction,
  updateSlideAction,
} from '../actions';

/**
 * The slide editor.
 *
 * A thumbnail rail on the left and one slide on the right. The canvas is
 * deliberately not a free-form drag surface: a teacher rearranging a lesson
 * wants two arrows and an undo-able result, not a canvas with snapping that
 * moves a slide when they meant to click it.
 *
 * WHY THE SELECTED SLIDE IS TRACKED BY ID AND NOT BY INDEX. A reorder changes
 * every index after it, so an index-tracked selection lands the teacher on a
 * different slide the moment they press the up arrow.
 *
 * PRESENT MODE IS IN HERE, NOT ON ITS OWN ROUTE. A deck is presented from the
 * tab it was built in, on the same device, minutes after it was last edited.
 * Making that a second route would mean the content is fetched and rendered
 * twice for what is a mode change.
 */

const ASPECT = 'aspect-[16/9]';

function bullets(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The same renderer the editor and the present mode share, so they cannot differ. */
export function SlideCanvas({
  slide,
  scale = 'text-2xl',
  bodyScale = 'text-lg',
}: {
  slide: SlideRecord;
  scale?: string;
  bodyScale?: string;
}) {
  const points = bullets(slide.body);

  return (
    <div className={`flex h-full w-full flex-col justify-center gap-5 p-8 ${ASPECT}`}>
      {slide.layout === 'blank' ? null : (
        <h2 className={`font-semibold leading-tight text-ink ${scale}`}>
          {slide.title || 'Untitled slide'}
        </h2>
      )}
      {slide.layout === 'title' || slide.layout === 'blank' ? null : points.length > 0 ? (
        <ul className={`flex flex-col gap-2.5 text-ink-muted ${bodyScale}`}>
          {points.map((point, index) => (
            <li key={`${index}-${point}`} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-ink-subtle ${bodyScale}`}>No points on this slide yet.</p>
      )}
    </div>
  );
}

function Thumbnail({
  slide,
  index,
  active,
  onSelect,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  busy,
}: {
  slide: SlideRecord;
  index: number;
  active: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const points = bullets(slide.body);

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[10px] border p-2 transition-colors duration-150 ${
        active
          ? 'border-accent bg-accent-subtle'
          : 'border-border bg-surface hover:bg-surface-sunken'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="flex w-full flex-col gap-1.5 rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-muted">{index + 1}</span>
          <span className="text-xs text-ink-subtle">{SLIDE_LAYOUT_LABELS[slide.layout]}</span>
        </span>
        <span className={`block w-full rounded-[6px] border border-border bg-surface ${ASPECT}`}>
          <span className="flex h-full flex-col justify-center gap-1.5 p-2">
            {slide.layout !== 'blank' ? (
              <span className="line-clamp-2 text-[0.6875rem] font-medium leading-tight text-ink">
                {slide.title || 'Untitled slide'}
              </span>
            ) : null}
            {slide.layout !== 'title' && points.length > 0 ? (
              <span className="line-clamp-3 text-[0.625rem] leading-tight text-ink-muted">
                {points.join(' · ')}
              </span>
            ) : null}
          </span>
        </span>
        <span className="sr-only">Select slide {index + 1}</span>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!canMoveUp || busy}
          onClick={onMoveUp}
          aria-label={`Move slide ${index + 1} up`}
          className="grid size-11 place-items-center rounded-[8px] text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 lg:size-8 lg:rounded-[6px]"
        >
          <ArrowUpIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!canMoveDown || busy}
          onClick={onMoveDown}
          aria-label={`Move slide ${index + 1} down`}
          className="grid size-11 place-items-center rounded-[8px] text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 lg:size-8 lg:rounded-[6px]"
        >
          <ArrowDownIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDuplicate}
          aria-label={`Duplicate slide ${index + 1}`}
          className="grid size-11 place-items-center rounded-[8px] text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 lg:size-8 lg:rounded-[6px]"
        >
          <CopyIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Delete slide ${index + 1}`}
          className="grid size-11 place-items-center rounded-[8px] text-ink-muted transition-colors duration-150 hover:bg-danger-subtle hover:text-danger disabled:pointer-events-none disabled:opacity-35 lg:size-8 lg:rounded-[6px]"
        >
          <TrashIcon size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * The slide form.
 *
 * Mounted with `key={slide.id}` by its parent, which is what loads a slide into
 * the fields. The obvious alternative, an effect that copies the selected slide
 * into state on every change, produces a second render pass for every
 * selection and throws away half-typed input the moment a save lands.
 */
function SlideForm({
  slide,
  deckId,
  position,
  total,
  onSaved,
}: {
  slide: SlideRecord;
  deckId: string;
  position: number;
  total: number;
  onSaved: () => void;
}) {
  const [layout, setLayout] = React.useState<SlideLayout>(slide.layout);
  const [title, setTitle] = React.useState(slide.title);
  const [body, setBody] = React.useState(slide.body);
  const [notes, setNotes] = React.useState(slide.notes);

  const save = useMutation({
    mutationFn: () => updateSlideAction({ slideId: slide.id, deckId, layout, title, body, notes }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onSaved();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Slide {position + 1}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField id="slide-layout" label="Layout">
            {(props) => (
              <Select
                {...props}
                value={layout}
                onChange={(event) => setLayout(event.target.value as SlideLayout)}
              >
                {SLIDE_LAYOUTS.map((option) => (
                  <option key={option} value={option}>
                    {SLIDE_LAYOUT_LABELS[option]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField id="slide-title" label="Title">
            {(props) => (
              <Input {...props} value={title} onChange={(event) => setTitle(event.target.value)} />
            )}
          </FormField>

          <FormField
            id="slide-body"
            label="Points"
            hint="One per line. These become the bullets on the slide."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="slide-notes"
            label="Speaker notes"
            hint="Only you see these, and only in present mode."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </FormField>

          <div className="flex justify-end">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving' : 'Save slide'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-[12px] border border-border bg-surface-sunken">
            <SlideCanvas
              slide={{ ...slide, layout, title, body }}
              scale="text-xl"
              bodyScale="text-base"
            />
          </div>
          {notes.trim().length > 0 ? (
            <p className="mt-4">
              <Badge tone="neutral">Notes present</Badge>
            </p>
          ) : null}
          {total <= 1 ? (
            <p className="mt-4 text-meta text-ink-muted">
              This is the only slide. Deleting it archives the deck.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function SlideEditor({ deck, slides }: { deck: DeckRecord; slides: SlideRecord[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState(slides[0]?.id ?? '');
  const [presenting, setPresenting] = React.useState(false);
  const [presentIndex, setPresentIndex] = React.useState(0);
  const [presentNotes, setPresentNotes] = React.useState(false);

  const selected = slides.find((slide) => slide.id === selectedId) ?? slides[0] ?? null;

  const refresh = async () => {
    await router.refresh();
  };

  const addSlide = useMutation({
    mutationFn: () => createSlideAction({ deckId: deck.id, layout: 'bullets', title: '' }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
      if (result.deckId) setSelectedId(result.deckId);
    },
  });

  const remove = useMutation({
    mutationFn: (slideId: string) => deleteSlideAction({ slideId, deckId: deck.id }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
      setSelectedId(slides.find((slide) => slide.id !== selectedId)?.id ?? '');
    },
  });

  const duplicate = useMutation({
    mutationFn: (slide: SlideRecord) =>
      createSlideAction({
        deckId: deck.id,
        layout: slide.layout,
        title: `${slide.title || 'Untitled slide'} copy`,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success('Slide duplicated.');
      await refresh();
    },
  });

  const move = useMutation({
    mutationFn: (input: { slideId: string; toIndex: number }) =>
      moveSlideAction({ slideId: input.slideId, deckId: deck.id, toIndex: input.toIndex }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      await refresh();
    },
  });

  const index = slides.findIndex((slide) => slide.id === selectedId);
  const busy = remove.isPending || move.isPending || duplicate.isPending;

  /*
   * Present mode is driven from the keyboard because it is used standing up,
   * holding a clicker or a keyboard, with no intention of finding a button.
   */
  React.useEffect(() => {
    if (!presenting) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        setPresentIndex((current) => Math.min(current + 1, slides.length - 1));
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setPresentIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === 'Escape') setPresenting(false);
      if (event.key.toLowerCase() === 'n') setPresentNotes((current) => !current);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, slides.length]);

  if (presenting) {
    const slide = slides[presentIndex];
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink text-surface">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <p className="text-[0.9375rem]">
            {deck.title}
            <span className="ml-2 text-surface/60">
              {presentIndex + 1} of {slides.length}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-surface hover:bg-white/10"
              onClick={() => setPresentNotes((current) => !current)}
            >
              {presentNotes ? 'Hide notes' : 'Show notes'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-surface hover:bg-white/10"
              onClick={() => setPresenting(false)}
            >
              <XIcon size={16} weight="bold" aria-hidden="true" />
              Exit
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
          {slide ? (
            <div className="w-full max-w-5xl rounded-[16px] bg-surface text-ink">
              <SlideCanvas slide={slide} scale="text-4xl" bodyScale="text-2xl" />
            </div>
          ) : null}

          {presentNotes && slide?.notes ? (
            <p className="w-full max-w-5xl rounded-[12px] bg-white/10 p-4 text-[0.9375rem] text-surface/90">
              {slide.notes}
            </p>
          ) : null}

          <p className="text-[0.8125rem] text-surface/60">
            Arrow keys move between slides. Press N for your notes, Escape to leave.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-white/10 px-5 py-4">
          <Button
            variant="secondary"
            disabled={presentIndex === 0}
            onClick={() => setPresentIndex((current) => Math.max(current - 1, 0))}
          >
            <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={presentIndex >= slides.length - 1}
            onClick={() => setPresentIndex((current) => Math.min(current + 1, slides.length - 1))}
          >
            Next
            <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h3">{deck.title}</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-muted">
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
          </p>
        </div>

        <Button
          onClick={() => {
            setPresentIndex(Math.max(index, 0));
            setPresenting(true);
          }}
          disabled={slides.length === 0}
        >
          <PaperPlaneTiltIcon size={18} weight="fill" aria-hidden="true" />
          Present
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Slides</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
              {slides.map((slide, position) => (
                <li key={slide.id}>
                  <Thumbnail
                    slide={slide}
                    index={position}
                    active={slide.id === selectedId}
                    busy={busy}
                    canMoveUp={position > 0}
                    canMoveDown={position < slides.length - 1}
                    onSelect={() => setSelectedId(slide.id)}
                    onMoveUp={() => move.mutate({ slideId: slide.id, toIndex: position - 1 })}
                    onMoveDown={() => move.mutate({ slideId: slide.id, toIndex: position + 1 })}
                    onDuplicate={() => duplicate.mutate(slide)}
                    onDelete={() => remove.mutate(slide.id)}
                  />
                </li>
              ))}
            </ul>

            <Button
              size="sm"
              variant="secondary"
              block
              disabled={addSlide.isPending}
              onClick={() => addSlide.mutate()}
            >
              <PlusIcon size={15} weight="bold" aria-hidden="true" />
              Add slide
            </Button>
          </CardContent>
        </Card>

        {selected ? (
          <SlideForm
            key={selected.id}
            slide={selected}
            deckId={deck.id}
            position={index}
            total={slides.length}
            onSaved={refresh}
          />
        ) : null}
      </div>
    </div>
  );
}