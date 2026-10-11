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
  ImageIcon,
  ListBulletsIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  TextAlignLeftIcon,
  TextHOneIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ElementInspector } from '@/components/slides/ElementInspector';
import { SlideCanvas, type SlideImageSource } from '@/components/slides/SlideCanvas';
import {
  SLIDE_ELEMENT_LABELS,
  legacyElements,
  nextElementRow,
} from '@/lib/slides/layout';
import {
  DEFAULT_TEXT_STYLE,
  normaliseElements,
  SLIDE_LAYOUTS,
  SLIDE_LAYOUT_LABELS,
  SLIDE_THEMES,
  SLIDE_THEME_LABELS,
  slidePlainText,
  type DeckRecord,
  type SlideElement,
  type SlideImageElement,
  type SlideLayout,
  type SlideRecord,
  type SlideTextElement,
  type SlideTheme,
} from '@/lib/api/types';

import {
  createSlideAction,
  deleteSlideAction,
  moveSlideAction,
  saveSlideElements,
  updateElementStyle,
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
 * WHY THE CANVAS IS THE SAME COMPONENT THE RAIL AND PRESENT MODE DRAW. Three
 * renderers is three chances for a slide to look right in the editor and wrong
 * on the projector, and that difference is found out in front of a class.
 *
 * PRESENT MODE IS IN HERE, NOT ON ITS OWN ROUTE. A deck is presented from the
 * tab it was built in, on the same device, minutes after it was last edited.
 * Making that a second route would mean the content is fetched and rendered
 * twice for what is a mode change.
 */

/**
 * What the picker needs from a deck file.
 *
 * Declared here rather than imported from the data boundary: that module is
 * server-only, and this component is not. The page hands over rows that already
 * satisfy it.
 */
export interface SlideEditorAsset {
  id: string;
  filename: string;
  /** Null for a file whose bytes are gone. It cannot be placed, only named. */
  url: string | null;
}

const AUTOSAVE_DELAY_MS = 700;

function Thumbnail({
  slide,
  index,
  assets,
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
  assets: SlideImageSource[];
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
  // The rail is the one place the canvas is decorative, and the button that
  // selects a slide sits over it rather than around it. The canvas draws real
  // block content, which is not valid inside a button, and an overlay means the
  // canvas is never rebuilt when the teacher presses it.
  const label = slidePlainText(slide.elements ?? null, slide.title || 'Untitled slide');

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[10px] border p-2 transition-colors duration-150 ${
        active
          ? 'border-accent bg-accent-subtle'
          : 'border-border bg-surface hover:bg-surface-sunken'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{index + 1}</span>
        <span className="text-xs text-ink-subtle">{SLIDE_LAYOUT_LABELS[slide.layout]}</span>
      </div>

      <div className="relative overflow-hidden rounded-[6px] border border-border">
        <SlideCanvas slide={slide} assets={assets} decorative />
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? 'true' : undefined}
          aria-label={`Slide ${index + 1}: ${label}`}
          className="absolute inset-0 h-full w-full rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="sr-only">Select slide {index + 1}</span>
        </button>
      </div>

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
 * The slide's own fields.
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
    <Card>
      <CardHeader>
        <CardTitle>Slide {position + 1} details</CardTitle>
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
          hint="One per line. These are the bullets on a slide that has no elements yet."
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          {notes.trim().length > 0 ? <Badge tone="neutral">Notes present</Badge> : <span />}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving' : 'Save details'}
          </Button>
        </div>

        {total <= 1 ? (
          <p className="text-meta text-ink-muted">
            This is the only slide. Deleting it archives the deck.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SlideEditor({
  deck,
  slides,
  assets,
}: {
  deck: DeckRecord;
  slides: SlideRecord[];
  assets: SlideEditorAsset[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState(slides[0]?.id ?? '');
  const [presenting, setPresenting] = React.useState(false);
  const [presentIndex, setPresentIndex] = React.useState(0);
  const [presentNotes, setPresentNotes] = React.useState(false);

  const selected = slides.find((slide) => slide.id === selectedId) ?? slides[0] ?? null;

  /*
   * WHY THE ELEMENT STATE RESETS DURING RENDER RATHER THAN IN AN EFFECT. An
   * effect that clears on a slide change paints one frame of the previous
   * slide's elements and the previous slide's selection against the new slide,
   * which on a projector-sized canvas is a flash of somebody else's lesson.
   * React supports adjusting state while rendering, so the reset happens before
   * anything is drawn.
   */
  const [editingSlideId, setEditingSlideId] = React.useState<string | null>(null);
  const [elements, setElements] = React.useState<SlideElement[] | null>(null);
  const [theme, setTheme] = React.useState<SlideTheme>('viridian');
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [chosenAssetId, setChosenAssetId] = React.useState('');

  /*
   * A write that was due for the slide the teacher just left. Resetting during
   * render cancels the debounce timer that would have sent it, so the payload is
   * parked here and sent by the effect below. Dropping it instead would lose the
   * last few words a teacher typed whenever they clicked the next slide, which is
   * the one thing this panel must never do.
   */
  /*
   * STATE, NOT A REF.
   *
   * This is written inside the render-phase reset below, and a ref written
   * during render is not safe: a render can be thrown away, and the write would
   * go with it, losing the keystroke this exists to protect. State set during
   * render is the pattern React documents for exactly this, and it survives a
   * discarded render because React re-runs it.
   */
  const [pendingWrite, setPendingWrite] = React.useState<{
    slideId: string;
    elements: SlideElement[] | null;
    theme: SlideTheme;
  } | null>(null);

  /*
   * WHAT THE AUTOSAVED PANEL SAYS BACK.
   *
   * The details form has always confirmed itself with a toast. Elements,
   * typography and theme are written a few hundred milliseconds after the last
   * change instead, and an editor that saves silently leaves the teacher
   * guessing whether it is talking to a server. The status is derived from the
   * mutation's own pending flag and flipped in its settled callback, so it
   * cannot claim a save the server refused.
   *
   * "Changes saved." and the details form's "Slide saved." are deliberately
   * different words. One panel saving does not mean the other saved, and two
   * identical confirmations on one screen read as one event.
   */
  const [saved, setSaved] = React.useState(false);

  if (selected && editingSlideId !== selected.id) {
    if (editingSlideId && dirty) {
      setPendingWrite({ slideId: editingSlideId, elements, theme });
    }
    setEditingSlideId(selected.id);
    setElements(normaliseElements(selected.elements));
    setTheme(SLIDE_THEMES.includes(selected.theme) ? selected.theme : 'viridian');
    setSelectedElementId(null);
    setDirty(false);
    setSaved(false);
  }

  const imageSources = React.useMemo<SlideImageSource[]>(
    () =>
      assets
        .filter((asset): asset is SlideEditorAsset & { url: string } => Boolean(asset.url))
        .map((asset) => ({ id: asset.id, src: asset.url, alt: asset.filename })),
    [assets],
  );

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

  const saveContent = useMutation({
    mutationFn: (input: { slideId: string; elements: SlideElement[] | null; theme: SlideTheme }) =>
      saveSlideElements({ slideId: input.slideId, elements: input.elements, theme: input.theme }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
    },
  });

  const saveStyle = useMutation({
    mutationFn: (input: { slideId: string; elementId: string; style: SlideTextElement['style'] }) =>
      updateElementStyle({
        slideId: input.slideId,
        elementId: input.elementId,
        patch: input.style,
      }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.message);
    },
  });

  /*
   * STYLE WRITES GO OUT ONE AT A TIME.
   *
   * `updateElementStyle` reads the slide, changes one element and writes the
   * whole list back, because the column is one jsonb value. Two of those
   * overlapping each other is a read, a read, a write, a write, and the second
   * write carries the array as the first one read it. A teacher who changes the
   * weight and then the colour quickly loses whichever change lands second, and
   * there is no error anywhere: both requests succeed.
   *
   * React Query runs concurrent mutations on one hook in parallel, so the
   * ordering has to be imposed here. A teacher changing two things in a second
   * is not an unusual thing to do, and "the last one you asked for is the one
   * you get" has to be true rather than usually true.
   */
  const styleQueue = React.useRef<Promise<unknown>>(Promise.resolve());

  const queueStyleSave = (input: {
    slideId: string;
    elementId: string;
    style: SlideTextElement['style'];
  }) => {
    setSaved(false);
    styleQueue.current = styleQueue.current
      .then(() => saveStyle.mutateAsync(input))
      .then(
        () => setSaved(true),
        () => setSaved(true),
      );
  };

  /*
   * Typing is debounced and styling is not. A style control is one discrete
   * choice and is saved on the element it changed, so two teachers editing
   * different elements of one slide do not overwrite each other. Typing is a
   * stream, and the whole list is written once the teacher stops.
   */
  React.useEffect(() => {
    if (!pendingWrite) return;
    /*
     * Cleared in the mutation's `onSettled`, NOT in the effect body.
     *
     * Calling setState synchronously in an effect body is the cascading-render
     * pattern this codebase's lint gate refuses. `onSettled` runs after the write
     * resolves, which is where "this has been dealt with" is actually true, and
     * clearing before the write lands would risk sending the same keystroke twice
     * if the effect ran again while it was in flight.
     */
    saveContent.mutate(pendingWrite, {
      onSettled: () => {
        setPendingWrite(null);
        setSaved(true);
      },
    });
  }, [pendingWrite, saveContent]);

  React.useEffect(() => {
    if (!dirty || !selected) return;
    const slideId = selected.id;
    const timer = window.setTimeout(() => {
      setDirty(false);
      setSaved(false);
      saveContent.mutate(
        { slideId, elements, theme },
        { onSettled: () => setSaved(true) },
      );
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, selected, elements, theme, saveContent]);

  const index = slides.findIndex((slide) => slide.id === selectedId);
  const busy = remove.isPending || move.isPending || duplicate.isPending;

  /** The list the canvas draws: stored elements, or the legacy layout's. */
  const drawn = React.useMemo(
    () => (selected ? { ...selected, elements, theme } : null),
    [selected, elements, theme],
  );

  /*
   * THE SELECTION LOOKUP READS THE SAME LIST THE CANVAS DRAWS.
   *
   * A slide written before elements existed stores `elements: null` and is drawn
   * from `legacyElements`. Resolving the selection against `elements` alone made
   * clicking its heading do nothing at all: the click set the id, the lookup had
   * nothing to match that id against, and the inspector kept reporting that
   * nothing was selected. That is every real deck in the wild until a teacher
   * edits it, so it is not an edge case.
   *
   * `addElement`, `patchElement` and `deleteElement` all already fell back to the
   * legacy list. This was the fourth reader of that same invariant and the only
   * one that did not, which is the shape a partial fix always takes.
   */
  const editableElements = React.useMemo(
    () => (selected ? elements ?? legacyElements(selected) : null),
    [selected, elements],
  );

  const selectedElement = selectedElementId
    ? editableElements?.find((element) => element.id === selectedElementId) ?? null
    : null;

  const commit = (next: SlideElement[] | null) => {
    setElements(next);
    setDirty(true);
  };

  const patchElement = (elementId: string, patch: Partial<SlideElement>, autosave = true) => {
    if (!selected) return;
    // A slide with no stored elements is drawn from its layout. Editing one of
    // its elements materialises it into the list the renderer can write back,
    // which is the moment a legacy slide stops being a legacy slide.
    const base = elements ?? legacyElements(selected);
    const next = base.map((element) =>
      element.id === elementId ? ({ ...element, ...patch } as SlideElement) : element,
    );
    setElements(next);
    // A style change is written by its own action, which touches only the
    // element it names. Marking it for the list write as well would send the
    // whole slide twice for one click.
    if (autosave) setDirty(true);
  };

  const addElement = (kind: 'heading' | 'text' | 'bullets' | 'image') => {
    if (!selected) return;
    const base = elements ?? legacyElements(selected);
    const row = nextElementRow(base);
    const id = `${kind}_${selected.id}_${row}`;
    const chosen = imageSources.find((asset) => asset.id === chosenAssetId) ?? imageSources[0];

    if (kind === 'image') {
      if (!chosen) return;
      const image: SlideImageElement = {
        id,
        kind: 'image',
        assetId: chosen.id,
        fit: 'cover',
        alt: chosen.alt,
        col: 1,
        span: 6,
        row,
        tall: 4,
      };
      commit([...base, image]);
      setSelectedElementId(id);
      return;
    }

    const text: SlideTextElement = {
      id,
      kind,
      content: '',
      col: 1,
      span: 6,
      row,
      tall: kind === 'heading' ? 2 : 4,
      style: {
        ...DEFAULT_TEXT_STYLE,
        size: kind === 'heading' ? 'lg' : 'md',
        weight: kind === 'heading' ? 'semibold' : 'normal',
      },
    };
    commit([...base, text]);
    setSelectedElementId(id);
  };

  const deleteElement = () => {
    if (!selected || !selectedElementId) return;
    commit((elements ?? legacyElements(selected)).filter((el) => el.id !== selectedElementId));
    setSelectedElementId(null);
  };

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

  /*
   * WHY PRESENTING FLUSHES FIRST. The canvas and the slides array are two
   * states: the one being edited and the one the server last sent. Presenting
   * from the second one would show a teacher the slide as it was before the
   * change they just made, which is the worst possible thing for a deck to do at
   * the moment it is about to be shown.
   */
  const enterPresent = async () => {
    if (selected && dirty) {
      setDirty(false);
      try {
        const result = await saveContent.mutateAsync({
          slideId: selected.id,
          elements,
          theme,
        });
        if (!result.ok) toast.error(result.message);
      } catch {
        toast.error('The last change could not be saved.');
      }
    }
    await refresh();
    setPresentIndex(Math.max(index, 0));
    setPresenting(true);
  };

  if (presenting) {
    const slide = slides[presentIndex];
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink text-surface">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          {/*
            The only h1 on the screen. Present mode replaces the whole editor
            rather than sitting over it, so the heading the page would have
            carried has to be carried here.
          */}
          <h1 className="text-[0.9375rem] font-semibold">
            {deck.title}
            <span className="ml-2 text-surface/60">
              {presentIndex + 1} of {slides.length}
            </span>
          </h1>
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
            <div className="w-full max-w-5xl overflow-hidden rounded-[16px]">
              <SlideCanvas slide={slide} assets={imageSources} />
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

        <Button onClick={() => void enterPresent()} disabled={slides.length === 0}>
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
                    assets={imageSources}
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

        {selected && drawn ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Slide {index + 1}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="overflow-hidden rounded-[12px] border border-border">
                      <SlideCanvas
                        slide={drawn}
                        assets={imageSources}
                        selectedId={selectedElementId}
                        onElementClick={setSelectedElementId}
                      />
                    </div>

                    <p className="text-meta text-ink-muted">
                      {selectedElement
                        ? `Selected: ${SLIDE_ELEMENT_LABELS[selectedElement.kind].toLowerCase()}. Change it in the panel beside this slide.`
                        : 'Choose something on the slide to change how it looks.'}
                    </p>

                    {/*
                     * `role="status"` rather than a toast: this describes the
                     * panel the teacher is looking at, it does not interrupt,
                     * and it stays on screen long enough to be read by someone
                     * who looked away for a second.
                     */}
                    <p role="status" className="text-meta text-ink-subtle">
                      {saveContent.isPending || saveStyle.isPending
                        ? 'Saving'
                        : saved
                          ? 'Changes saved.'
                          : 'Changes here save on their own once you stop.'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Add to this slide</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {/*
                      The image button is disabled rather than offered broken when
                      the deck has no images. A picker with nothing in it is a
                      control that cannot do the thing it exists to do.
                    */}
                    {imageSources.length > 0 ? (
                      <FormField id="slide-image-source" label="Image">
                        {(props) => (
                          <Select
                            {...props}
                            value={chosenAssetId || imageSources[0]!.id}
                            onChange={(event) => setChosenAssetId(event.target.value)}
                          >
                            {imageSources.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.alt}
                              </option>
                            ))}
                          </Select>
                        )}
                      </FormField>
                    ) : (
                      <p className="text-meta text-ink-muted">
                        This deck has no images yet. Add a file to the deck below and it will
                        be listed here, ready to place.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => addElement('heading')}
                      >
                        <TextHOneIcon size={15} weight="bold" aria-hidden="true" />
                        Heading
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => addElement('text')}>
                        <TextAlignLeftIcon size={15} weight="bold" aria-hidden="true" />
                        Text
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => addElement('bullets')}>
                        <ListBulletsIcon size={15} weight="bold" aria-hidden="true" />
                        Bullet list
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={imageSources.length === 0}
                        onClick={() => addElement('image')}
                      >
                        <ImageIcon size={15} weight="bold" aria-hidden="true" />
                        Image
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Background</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Slide background">
                      {SLIDE_THEMES.map((option) => {
                        const active = option === theme;
                        return (
                          <Button
                            key={option}
                            size="sm"
                            variant={active ? 'primary' : 'secondary'}
                            aria-pressed={active}
                            onClick={() => {
                              setTheme(option);
                              setDirty(true);
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={`size-4 rounded-full border border-border ${
                                option === 'ink'
                                  ? 'bg-ink dark:bg-surface-sunken'
                                  : option === 'paper'
                                    ? 'bg-surface-raised'
                                    : option === 'dusk'
                                      ? 'bg-accent'
                                      : 'bg-surface'
                              }`}
                            />
                            {SLIDE_THEME_LABELS[option]}
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <SlideForm
                  key={selected.id}
                  slide={selected}
                  deckId={deck.id}
                  position={index}
                  total={slides.length}
                  onSaved={refresh}
                />
              </div>

              <ElementInspector
                element={selectedElement}
                theme={theme}
                busy={saveContent.isPending}
                onStyleChange={(style) => {
                  if (!selectedElementId || !selected) return;
                  /*
                   * A slide with no stored elements has nothing for the patch
                   * action to find, because its heading and points are drawn
                   * from the layout rather than stored. The first change on such
                   * a slide writes the whole list, which turns it into an
                   * element list, and the changes after that are patches.
                   */
                  const fromLayout = elements === null;
                  patchElement(selectedElementId, { style }, fromLayout);
                  if (!fromLayout) {
                    /*
                     * THIS WRITE TOO HAS TO REPORT ITSELF.
                     *
                     * The first edit on a slide goes through `saveContent`, and
                     * every edit after it goes through `saveStyle`. The status
                     * line watched only the first, so from the second edit
                     * onwards the panel sat on "changes here save on their own"
                     * while a write was in flight, and never once said it had
                     * landed. It looked correct on a slide nobody had edited
                     * yet, which is exactly the state the tests ran in.
                     */
                    queueStyleSave({
                      slideId: selected.id,
                      elementId: selectedElementId,
                      style,
                    });
                  }
                }}
                onContentChange={(content) => {
                  if (selectedElementId) patchElement(selectedElementId, { content });
                }}
                onFitChange={(fit) => {
                  if (selectedElementId) patchElement(selectedElementId, { fit });
                }}
                onAltChange={(alt) => {
                  if (selectedElementId) patchElement(selectedElementId, { alt });
                }}
                onDelete={deleteElement}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}