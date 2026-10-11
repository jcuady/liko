'use client';

import * as React from 'react';
import Image from 'next/image';

import {
  slideAlignClass,
  slideElements,
  slideFontClass,
  slideFontSizeCqw,
  slideFrameClass,
  slideGroundClass,
  slideHeadingRuleClass,
  slideHoverClass,
  slideInkClass,
  slidePlacement,
  slideSelectionClass,
  slideWeightClass,
  SLIDE_ELEMENT_LABELS,
} from '@/lib/slides/layout';
import type {
  SlideElement,
  SlideImageElement,
  SlideLayout,
  SlideTextElement,
  SlideTheme,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * The one slide renderer.
 *
 * WHY THIS IS A SINGLE COMPONENT USED IN THREE PLACES. The editor stage, the
 * thumbnail rail and present mode all draw through here. A second renderer for
 * present mode is a slide that looks correct on the laptop and wrong on the
 * projector, and nobody finds that out until the lesson starts, which is the one
 * moment where finding it out is expensive.
 *
 * WHY EVERY SIZE IS IN CONTAINER UNITS. The same slide is drawn at roughly
 * 240px in the rail and at 1000px on a wall. Type in pixels is right at exactly
 * one of those, so the scale is a percentage of the frame's own width and the
 * three places cannot drift.
 */

/** An image the deck can place, resolved to something the browser can fetch. */
export interface SlideImageSource {
  id: string;
  src: string;
  alt: string;
}

export interface SlideCanvasProps {
  slide: {
    theme: SlideTheme;
    elements: SlideElement[] | null;
    layout: SlideLayout;
    title: string;
    body: string;
  };
  /** Multiplies the type scale. One keeps the size the teacher chose. */
  scale?: number;
  onElementClick?: (elementId: string) => void;
  selectedId?: string | null;
  assets?: SlideImageSource[];
  /**
   * Set where the canvas is not the page's content: the thumbnail rail, where a
   * button over the canvas already carries the slide's text. A heading element
   * is not valid inside a button, and the same markup has to serve both places.
   */
  decorative?: boolean;
  className?: string;
  ariaLabel?: string;
}

function elementName(element: SlideElement): string {
  const label = SLIDE_ELEMENT_LABELS[element.kind];
  if (element.kind === 'image') {
    const alt = element.alt.trim();
    return alt ? `${label}: ${alt}` : `${label}, with no alt text`;
  }
  const words = element.content.replace(/\s+/g, ' ').trim();
  return words ? `${label}: ${words.slice(0, 80)}` : `${label}, empty`;
}

function bulletsOf(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The empty box a teacher clicks into. It has to say what it is. */
function EmptyElement({ element }: { element: SlideElement }) {
  return (
    <span className="flex h-full min-h-[2rem] w-full items-center rounded-[8px] border border-dashed border-current p-[1cqw] text-[2cqw] leading-tight opacity-70">
      Empty {SLIDE_ELEMENT_LABELS[element.kind].toLowerCase()}
    </span>
  );
}

function SlideImage({
  element,
  source,
  theme,
}: {
  element: SlideImageElement;
  source?: SlideImageSource;
  theme: SlideTheme;
}) {
  const alt = element.alt.trim() || source?.alt.trim() || 'Slide image';

  return (
    <span className="relative block h-full min-h-[2rem] w-full overflow-hidden rounded-[8px] border border-border bg-surface-sunken">
      {source ? (
        <Image
          src={source.src}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          // `fill` gives the box its dimensions, so the image cannot shift the
          // layout while it loads or while the optimiser is thinking about it.
          className={element.fit === 'contain' ? 'object-contain' : 'object-cover'}
          // The fixtures adapter serves a one pixel data URL. The optimiser has
          // nothing to do with that, and asking it to would fail the render.
          unoptimized={source.src.startsWith('data:')}
        />
      ) : (
        // The theme's own muted ink, not a fixed grey. A placeholder that is
        // legible on the light grounds is unreadable on the green one, and a
        // missing image is exactly when the teacher most needs to read it.
        <span
          className={`flex h-full w-full items-center justify-center p-[1.5cqw] text-center text-[2cqw] leading-tight ${slideInkClass(theme, 'muted')}`}
        >
          This image is no longer in the deck&rsquo;s files.
        </span>
      )}
    </span>
  );
}

function TextElementBody({
  element,
  theme,
  asHeading,
  className,
}: {
  element: SlideTextElement;
  theme: SlideTheme;
  asHeading: boolean;
  className?: string;
}) {
  const { style } = element;
  const shared = cn(
    'w-full overflow-hidden break-words',
    slideFontClass(style.font),
    slideWeightClass(style.weight),
    slideAlignClass(style.align),
    slideInkClass(theme, style.ink),
    className,
  );

  const typeStyle: React.CSSProperties = {
    fontSize: `calc(${slideFontSizeCqw(element.kind, style.size)}cqw * var(--slide-scale, 1))`,
  };

  if (element.kind === 'heading') {
    const rule = slideHeadingRuleClass(theme);
    if (asHeading) {
      return (
        <h2 className={cn(shared, 'leading-[1.12]', rule)} style={typeStyle}>
          {element.content}
        </h2>
      );
    }
    return (
      <p className={cn(shared, 'leading-[1.12]', rule)} style={typeStyle}>
        {element.content}
      </p>
    );
  }

  if (element.kind === 'bullets') {
    return (
      <ul className={cn(shared, 'flex flex-col gap-[0.9cqw] leading-[1.4]')} style={typeStyle}>
        {bulletsOf(element.content).map((point, index) => (
          <li key={`${index}-${point}`} className="flex gap-[1cqw]">
            {/*
             * The marker takes the colour of its own text. An accent dot on the
             * accent ground is a dot nobody can see.
             */}
            <span aria-hidden="true" className="mt-[0.55cqw] size-[0.7cqw] shrink-0 rounded-full bg-current" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className={cn(shared, 'leading-[1.45]')} style={typeStyle}>
      {element.content}
    </p>
  );
}

export function SlideCanvas({
  slide,
  scale = 1,
  onElementClick,
  selectedId,
  assets = [],
  decorative = false,
  className,
  ariaLabel,
}: SlideCanvasProps) {
  const theme = slide.theme;
  const elements = slideElements(slide);
  const frame = slideFrameClass(theme);
  const interactive = typeof onElementClick === 'function';
  // A heading is only a heading where headings belong: in present mode and in
  // the editor's own page. Everywhere else it is a styled paragraph, because a
  // canvas inside a button is not allowed to carry one.
  const asHeading = !interactive && !decorative;

  const byId = React.useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  return (
    <div
      /*
       * Stable hooks for the end-to-end proof.
       *
       * The suite has to address the projected surface rather than "the first
       * div on the page", because this same component renders in three places at
       * once (the stage, the thumbnail rail and present mode) and a positional
       * locator silently retargets when one of them moves.
       */
      data-slide-canvas=""
      className={cn(
        '@container relative aspect-[16/9] w-full overflow-hidden',
        slideGroundClass(theme),
        className,
      )}
      style={{ '--slide-scale': scale } as React.CSSProperties}
      aria-hidden={decorative || undefined}
      role={ariaLabel && !decorative ? 'img' : undefined}
      aria-label={decorative ? undefined : ariaLabel}
    >
      {frame ? <span aria-hidden="true" className={cn('pointer-events-none', frame)} /> : null}

      <div className="absolute inset-0 grid grid-cols-6 grid-rows-8 p-[5cqw]">
        {elements.map((element) => {
          const { columnStart, columnEnd, rowStart, rowEnd } = slidePlacement(element);
          const placement: React.CSSProperties = {
            gridColumn: `${columnStart} / ${columnEnd}`,
            gridRow: `${rowStart} / ${rowEnd}`,
          };
          const selected = interactive && selectedId === element.id;

          return (
            <div key={element.id} data-slide-element={element.id} style={placement} className="min-h-0">
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onElementClick(element.id)}
                  aria-pressed={selected}
                  aria-label={elementName(element)}
                  className={cn(
                    'flex h-full min-h-11 w-full flex-col justify-start rounded-[8px] p-[0.8cqw] text-left',
                    slideInkClass(theme, element.kind === 'image' ? 'ink' : element.style.ink),
                    slideHoverClass(theme),
                    selected ? slideSelectionClass(theme) : '',
                  )}
                >
                  {element.kind === 'image' ? (
                    <SlideImage element={element} source={byId.get(element.assetId)} theme={theme} />
                  ) : element.content.trim().length === 0 ? (
                    <EmptyElement element={element} />
                  ) : (
                    <TextElementBody element={element} theme={theme} asHeading={false} />
                  )}
                </button>
              ) : element.kind === 'image' ? (
                <SlideImage element={element} source={byId.get(element.assetId)} theme={theme} />
              ) : element.content.trim().length === 0 ? null : (
                <TextElementBody element={element} theme={theme} asHeading={asHeading} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}