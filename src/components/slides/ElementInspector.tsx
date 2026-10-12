'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
            value={style.size}
            onValueChange={(next) => onStyleChange({ ...style, size: next as typeof style.size })}
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {SLIDE_SIZE_LABELS[size]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id="element-weight" label="Weight">
        {(props) => (
          <Select
            value={style.weight}
            onValueChange={(next) =>
              onStyleChange({ ...style, weight: next as typeof style.weight })
            }
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_WEIGHTS.map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {SLIDE_WEIGHT_LABELS[weight]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id="element-font" label="Font">
        {(props) => (
          <Select
            value={style.font}
            onValueChange={(next) => onStyleChange({ ...style, font: next as typeof style.font })}
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_FONTS.map((font) => (
                <SelectItem key={font} value={font}>
                  {SLIDE_FONTS_LABELS[font]}
                </SelectItem>
              ))}
            </SelectContent>
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
            value={style.ink}
            onValueChange={(next) => onStyleChange({ ...style, ink: next as typeof style.ink })}
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {inks.map((ink) => (
                <SelectItem key={ink} value={ink}>
                  {SLIDE_INK_LABELS[ink]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField id="element-align" label="Alignment">
        {(props) => (
          <Select
            value={style.align}
            onValueChange={(next) => onStyleChange({ ...style, align: next as typeof style.align })}
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_ALIGNMENTS.map((align) => (
                <SelectItem key={align} value={align}>
                  {SLIDE_ALIGNMENT_LABELS[align]}
                </SelectItem>
              ))}
            </SelectContent>
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
            value={element.fit}
            onValueChange={(next) => onFitChange(next as SlideImageElement['fit'])}
          >
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FITS.map((fit) => (
                <SelectItem key={fit} value={fit}>
                  {SLIDE_FIT_LABELS[fit]}
                </SelectItem>
              ))}
            </SelectContent>
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
          <Trash2 size={16} aria-hidden="true" />
          Delete {label.toLowerCase()}
        </Button>
      </CardContent>
    </Card>
  );
}