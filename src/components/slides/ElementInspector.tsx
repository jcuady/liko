'use client';

import { TrashIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  SLIDE_ALIGNMENTS,
  SLIDE_ALIGNMENT_LABELS,
  SLIDE_FONTS,
  SLIDE_FONTS_LABELS,
  SLIDE_INK_LABELS,
  SLIDE_SIZES,
  SLIDE_SIZE_LABELS,
  SLIDE_WEIGHTS,
  SLIDE_WEIGHT_LABELS,
  type SlideElement,
  type SlideImageElement,
  type SlideTextElement,
  type SlideTheme,
} from '@/lib/api/types';
import { SLIDE_ELEMENT_LABELS, SLIDE_FIT_LABELS, slideInkOptions } from '@/lib/slides/layout';

/**
 * The formatting controls for whatever is selected on the canvas.
 *
 * WHY THE GRID IS NOT EDITED HERE. Placement is a property of the slide, not a
 * decoration on an element: a teacher who can drag a heading into the bottom
 * corner produces a slide whose title is under its bullets. What is here is the
 * set of choices that cannot break a slide, which is also the set that survives
 * the renderer drawing it at a fifth of the size.
 *
 * WHY EVERY CONTROL IS A LABELLED FIELD RATHER THAN A ROW OF TOGGLES. A row of
 * icon toggles is smaller and quicker on a desktop with a mouse, and it is
 * unusable with a screen reader and unreachable on a phone. The select is the
 * control that works in all three, and `FormField` already carries the label,
 * the hint and the error wiring this panel needs.
 */

const FITS: SlideImageElement['fit'][] = ['cover', 'contain'];

export interface ElementInspectorProps {
  element: SlideElement | null;
  /** The slide's theme, because which inks are legible depends on the ground. */
  theme: SlideTheme;
  /** Style changes are saved on their own; see `updateElementStyle`. */
  onStyleChange: (style: SlideTextElement['style']) => void;
  onContentChange: (content: string) => void;
  onFitChange: (fit: SlideImageElement['fit']) => void;
  onAltChange: (alt: string) => void;
  onDelete: () => void;
  busy?: boolean;
}

function TextControls({
  element,
  theme,
  onStyleChange,
}: {
  element: SlideTextElement;
  theme: SlideTheme;
  onStyleChange: (style: SlideTextElement['style']) => void;
}) {
  const style = element.style;
  const inks = slideInkOptions(theme);

  return (
    <>
      <FormField id="element-size" label="Size">
        {(props) => (
          <Select
            {...props}
            value={style.size}
            onChange={(event) => onStyleChange({ ...style, size: event.target.value as typeof style.size })}
          >
            {SLIDE_SIZES.map((size) => (
              <option key={size} value={size}>
                {SLIDE_SIZE_LABELS[size]}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField id="element-weight" label="Weight">
        {(props) => (
          <Select
            {...props}
            value={style.weight}
            onChange={(event) => onStyleChange({ ...style, weight: event.target.value as typeof style.weight })}
          >
            {SLIDE_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {SLIDE_WEIGHT_LABELS[weight]}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField id="element-font" label="Font">
        {(props) => (
          <Select
            {...props}
            value={style.font}
            onChange={(event) => onStyleChange({ ...style, font: event.target.value as typeof style.font })}
          >
            {SLIDE_FONTS.map((font) => (
              <option key={font} value={font}>
                {SLIDE_FONTS_LABELS[font]}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField
        id="element-ink"
        label="Colour"
        hint="Only the colours that stay readable on this slide are offered."
      >
        {(props) => (
          <Select
            {...props}
            value={style.ink}
            onChange={(event) => onStyleChange({ ...style, ink: event.target.value as typeof style.ink })}
          >
            {inks.map((ink) => (
              <option key={ink} value={ink}>
                {SLIDE_INK_LABELS[ink]}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField id="element-align" label="Alignment">
        {(props) => (
          <Select
            {...props}
            value={style.align}
            onChange={(event) => onStyleChange({ ...style, align: event.target.value as typeof style.align })}
          >
            {SLIDE_ALIGNMENTS.map((align) => (
              <option key={align} value={align}>
                {SLIDE_ALIGNMENT_LABELS[align]}
              </option>
            ))}
          </Select>
        )}
      </FormField>
    </>
  );
}

function ImageControls({
  element,
  onFitChange,
  onAltChange,
}: {
  element: SlideImageElement;
  onFitChange: (fit: SlideImageElement['fit']) => void;
  onAltChange: (alt: string) => void;
}) {
  return (
    <>
      <FormField id="element-fit" label="Fit">
        {(props) => (
          <Select
            {...props}
            value={element.fit}
            onChange={(event) => onFitChange(event.target.value as SlideImageElement['fit'])}
          >
            {FITS.map((fit) => (
              <option key={fit} value={fit}>
                {SLIDE_FIT_LABELS[fit]}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {/*
        Alt text is not decoration on this control. An image of a leaf cell with
        no alt is invisible to the student using a screen reader, and this is the
        one place that can fix it before the slide is presented.
      */}
      <FormField
        id="element-alt"
        label="Alt text"
        hint="What the image shows, in a sentence."
        required
      >
        {(props) => (
          <Input
            {...props}
            value={element.alt}
            placeholder="A leaf cell under a microscope"
            onChange={(event) => onAltChange(event.target.value)}
          />
        )}
      </FormField>
    </>
  );
}

export function ElementInspector({
  element,
  theme,
  onStyleChange,
  onContentChange,
  onFitChange,
  onAltChange,
  onDelete,
  busy = false,
}: ElementInspectorProps) {
  if (!element) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selected element</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-meta text-ink-muted">
            Choose something on the slide above to change how it looks. Nothing is selected yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const label = SLIDE_ELEMENT_LABELS[element.kind];
  const summary =
    element.kind === 'heading'
      ? 'The line a student reads first.'
      : element.kind === 'text'
        ? 'A paragraph on the slide.'
        : element.kind === 'bullets'
          ? 'One point per line, drawn as a list.'
          : 'A picture placed from this deck.';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-meta text-ink-muted">{summary}</p>

        {element.kind === 'image' ? (
          <ImageControls element={element} onFitChange={onFitChange} onAltChange={onAltChange} />
        ) : (
          <>
            <FormField
              id="element-content"
              label={element.kind === 'bullets' ? 'Points' : 'Text'}
              hint={
                element.kind === 'bullets'
                  ? 'One point per line. The renderer draws the bullets.'
                  : undefined
              }
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={element.kind === 'bullets' ? 5 : 3}
                  value={element.content}
                  onChange={(event) => onContentChange(event.target.value)}
                />
              )}
            </FormField>

            <TextControls element={element} theme={theme} onStyleChange={onStyleChange} />
          </>
        )}

        <Button variant="danger" disabled={busy} onClick={onDelete}>
          <TrashIcon size={16} weight="bold" aria-hidden="true" />
          Delete {label.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}