# LIKO design system

The system of record for LIKO's visual language. Everything here lives in
`src/app/globals.css` under a Tailwind v4 `@theme` block plus a paired
`:root` / `.dark` variable set.

## Brief read

B2B SaaS landing page for education professionals. Premium and calm. Tailwind
v4 with Geist, restrained motion, and two scroll-narrative set pieces.

**Dials:** `DESIGN_VARIANCE 7` · `MOTION_INTENSITY 6` · `VISUAL_DENSITY 3`

Variance is high enough to forbid a centred hero and to require distinct layout
families. Motion intensity is high enough to justify two pinned narratives but not
a continuous-motion page. Density is deliberately low: the reference this builds
from uses a great deal of whitespace, and matching its rhythm requires it.

## Brand

The supplied artwork arrived as a JPEG painted over a checkerboard, so it has no
real transparency and cannot ship as a logo. It was reconstructed as vector from
measurements rather than traced, because tracing a compressed bitmap produces
paths full of sub-pixel noise.

**The mark** is the LK ligature: one continuous stroke that runs from the foot on
the lower left, turns up, curves right over a semicircular arch, and comes back
down as the K's stem. The K's two arms spring off it at 45 degrees. It is a 79
unit stroke with round terminals and a miter join, inside a 514 x 509 box.

**The lockup** adds the LIKO wordmark, four capitals with monolinear strokes and
round terminals, optically centred against the monogram rather than sitting on its
baseline. Caps are 312 units tall with 71 unit stems and 67 unit diagonals. The O
is a ring rather than a stroke, because its walls measure 72 at the sides and 63
across the top, which no uniform pen produces.

Three files keep this from drifting, and all three must move together:

| File | Role |
|---|---|
| `scripts/build-logo.cjs` | Emits `public/brand/liko-logo.svg` and `liko-mark.svg`. The source of the numbers. |
| `src/components/brand/logo-geometry.ts` | The same geometry as data, for React, the generated icons and the OG image. |
| `scripts/verify-logo.cjs` | Rasterises the generated SVG and diffs its ink box and per-glyph bounding boxes against the supplied original. |

`verify-logo.cjs` is the regression test. It currently reports every glyph within
0 to 3 units of the original across a 1536 unit canvas, which is under 0.3%.
Run it with `--dump` to write both rasters for inspection.

The icon routes, the Apple icon, the maskable icon and the OG image are all
generated at build time by Next.js from `logo-geometry.ts`, so they cannot fall out
of step with the SVG. The maskable icon holds the mark inside the 80% safe area
Android crops to; every other icon is full-bleed because iOS applies its own mask.

## Colour

Three brand constants:

| Token | Value | Role |
|---|---|---|
| `--color-charcoal` | `#1A1A1A` | Deep Viridian Charcoal. Modal scrim and brand artwork. Fixed, never themed |
| `--color-viridian` | `#29813D` | Forest Viridian as shipped. The logo. Fixed, never themed |
| `--color-bg` | `var(--surface)` | Warm White, page background. An alias of the page role, so it follows the theme |

`--color-charcoal` and `--color-viridian` are the only literal colour values
left in the theme. Both describe fixed brand marks rather than a surface, so
neither should invert when the theme does. Everything else routes through a role.

The accent is the green measured off the supplied logo artwork. `masterplan.md.txt`
names `#228B22`, but the shipped mark is `#29813D`: a bluer, slightly deeper
forest. The logo is the brand's most visible asset, so the palette follows the
artwork rather than the reverse. The swap also improves contrast against the
warm canvas, from 4.15:1 to 4.63:1, so it is the better choice on
accessibility grounds as well.

**Viridian is the only accent.** No section introduces a second hue. The at-risk
heatmap uses a viridian to amber to red ramp, which is permitted because it
encodes state rather than brand.

The reference art direction for the landing page uses lavender and rose gradient
blooms. Those hues are rotated into the viridian family for this brand. The
composition is preserved; the palette is not inherited.

### Paired surfaces

Dark mode is a paired system, not an inversion. The accent lifts and
desaturates so it stays legible without glowing, and every foreground and
background pair is contrast-tested independently rather than assumed to carry
over.

| Token | Light | Dark |
|---|---|---|
| `--surface` | `#FDF8F5` | `#12130F` |
| `--surface-raised` | `#FFFFFF` | `#1A1C17` |
| `--surface-sunken` | `#F7F3EE` | `#0D0E0B` |
| `--ink` | `#1A1A1A` | `#F4F2EE` |
| `--ink-muted` | `#5C5A54` | `#A8A69E` |
| `--ink-subtle` | `#837F76` | `#86847C` |
| `--accent` | `#29813D` | `#46A05A` |
| `--accent-hover` | `#216B34` | `#56B46A` |
| `--on-accent` | `#FFFFFF` | `#12130F` |
| `--on-danger` | `#FFFFFF` | `#12130F` |
| `--border` | `#E5E0D9` | `#4A4F43` |
| `--border-strong` | `#D5CEC4` | `#6B7160` |

#### How a component reaches a colour

There are two tiers and components only ever touch the second one.

- **Primitives** (`--color-surface`, `--color-ink-muted`) are what Tailwind
  compiles. They are declared `@theme inline`, so each one is written as
  `var(--surface-raised)` and resolved at the point of use.
- **Roles** (`--surface-raised`, `--ink-muted`) are the only place a value is
  written down, and `:root` and `.dark` both declare them.

`inline` is load-bearing, not stylistic. A plain `@theme` copies each value into
a `--color-*` property on `:root` and utilities compile to `var(--color-*)`. That
property is never overridden, so the utility keeps the light value whatever
`.dark` says. That is exactly what happened here: 711 call sites across 86 files
looked themeable and were not, rendering the light palette onto a dark page. Any
future colour token added to the plain `@theme` block reintroduces the same bug,
so the block is split and the split is commented in `globals.css`.

#### Roles that have to invert

A fill that changes lightness with the theme cannot keep a fixed label. Two roles
exist for that, both measured rather than assumed:

| Pair | Light | Dark |
|---|---|---|
| `--on-accent` on `--accent` | `#FFFFFF` on `#29813D`, 4.88:1 | `#12130F` on `#46A05A`, 5.72:1 (white would be 3.26:1) |
| `--on-danger` on `--danger` | `#FFFFFF` on `#B3261E`, 6.54:1 | `#12130F` on `#F2B8B5`, 10.92:1 (white would be 1.71:1) |

There is no `--on-success` or `--on-warning`: nothing renders a filled control
in those hues, and a token with no consumer is maintenance for zero pixels.

#### Borders carry two different jobs

`--border` draws container edges and dividers, which only have to be locatable,
so it stays quiet. `--border-strong` draws the edge of something interactive,
and WCAG 1.4.11 requires 3:1 for exactly that. Form controls in `input.tsx`
therefore use `border-border-strong` rather than `border-border`, which puts the
dark-theme field edge at 3.40:1 against its own fill.

Light-mode body text runs at 16.5:1 for primary ink and 6.9:1 for muted, both
clear of AA.

#### Known, measured gaps in light mode

These predate the dark-mode work, were left alone deliberately, and are recorded
here so they are not mistaken for oversight. All three are light-theme only.

| Pair | Measured | Needs | Note |
|---|---|---|---|
| `--ink-subtle` on `--surface` | 3.79:1 | 4.5:1 | The tightest text pair in the system. `#726E65` clears 4.5:1 on all three light surfaces at the same hue. |
| `--ink-subtle` on `--surface-raised` | 3.99:1 | 4.5:1 | Same fix. |
| `--border-strong` on `--surface-raised` | 1.56:1 | 3:1 | The input edge. `#8B8478` reaches 3.70:1 but is visibly heavy for this design language, and every field already carries a text label. |

Dark mode has no known failing pair. Re-verify with the browser measurement in
`globals.css` rather than by reading the table above.

### Elevation

Soft and viridian-tinted, never pure black:

```css
--shadow-sm:  0 1px 2px rgb(26 26 26 / 0.04), 0 1px 1px rgb(26 26 26 / 0.03);
--shadow-md:  0 4px 16px rgb(26 26 26 / 0.06), 0 2px 4px rgb(26 26 26 / 0.04);
--shadow-lg:  0 12px 40px rgb(26 26 26 / 0.10), 0 4px 8px rgb(26 26 26 / 0.04);
```

Dark mode raises the opacity rather than swapping for a black shadow.

### Shape

One radius system, no exceptions: `--radius-sm 8px` for chips, `--radius-md
12px` for inputs and small buttons, `--radius-lg 16px` for cards, `--radius-xl
24px` for large panels, `--radius-pill` for fully rounded controls.

## Typography

**Geist** and **Geist Mono**, self-hosted through `next/font` with
`display: 'swap'`, exposed as `--font-sans` and `--font-mono`.

Söhne is named in the brand specification but is a paid Klim licence that cannot
be fetched from npm. Geist is the closest open neo-grotesk. **Swapping in a
licensed Söhne later means editing two imports in `src/app/layout.tsx` and
nothing else**, because every component reads the token rather than a font
family directly.

| Class | Size / leading / tracking | Use |
|---|---|---|
| `text-display` | `clamp(2.75rem, 6vw, 5rem)` / `1.02` / `-0.035em` | Hero only |
| `text-h2` | `clamp(2rem, 3.6vw, 3rem)` / `1.08` / `-0.03em` | Section headlines |
| `text-h3` | `clamp(1.5rem, 2.4vw, 2rem)` / `1.2` / `-0.02em` | Sub-headlines, quotes |
| `text-lead` | `1.125rem` / `1.6` / `-0.01em` | Hero and section subtext |
| `text-body` | `1rem` / `1.65` | Body copy |
| `text-label` | `0.75rem` uppercase, `0.14em` tracking, weight 600 | Section labels |
| `text-meta` | `0.875rem` | Helper and secondary text |
| `.tabular` | Geist Mono, `tabular-nums` | Any changing number |

Body copy is capped at 65 characters. Mobile body text is never below 16px,
which prevents iOS auto-zoom on focus. Every number that can change uses
`.tabular` so a figure going from 79 to 80 does not reflow its column.

### Emphasis

Italic emphasis uses the **same family in italic**, never a mixed serif. Any
italic word containing a descender (`y g j p q`) carries the `.italic-accent`
class, which relaxes leading to `1.1` and adds bottom padding so the glyph does
not clip into the line below.

## Motion

Custom curves only. Built-in CSS easings are too weak to feel intentional.

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

`ease-in` is never used on a UI element. It delays the initial movement, which is
exactly the moment a user is watching most closely.

| Interaction | Duration | Easing |
|---|---|---|
| Button press | 120ms | `--ease-out`, `scale(0.97)` |
| Tooltip | 150ms | `--ease-out` |
| Dropdown, select | 180ms | `--ease-out`, origin-anchored |
| Dialog | 220ms in, 140ms out | `--ease-out`, `scale(0.96)` |
| Mobile sheet | 320ms in, 200ms out | `--ease-drawer` |
| Route change | 180ms | crossfade with `blur(2px)` |
| Stagger reveal | 40ms per item | `--ease-out` |

### The library split

**`motion`** handles all UI state, layout transitions, hover physics, viewport
reveals, and both landing-page scroll narratives: the Flow sticky stack and the
Roles horizontal pan.

There is exactly one animation runtime on `/`. It used to be two, GSAP +
ScrollTrigger for the two narratives and Motion for everything else, which put
two full runtimes in the same page chunk: the GSAP chunks came to 50 KB and
94 KB before compression and the `/` route carried both. Pinning is native
`position: sticky` now rather than JS scroll pinning, which is also why
`<main>` uses `overflow-x-clip` rather than `overflow-x-hidden`: the latter
computes the other axis to `auto`, making the element a scrollport, and sticky
resolves against the nearest scrollport, so it would never have stuck.

### Scroll reveals

One primitive, `components/Reveal.tsx`, does every viewport reveal on the
marketing page. `SectionHeader` calls it internally, so a new section cannot
forget to animate its heading.

It moves `transform` and `opacity` only, runs once (`viewport={{ once: true }}`),
and staggers siblings by passing a `delay` roughly 0.06s apart. It deliberately
is not a group/stagger component: a wrapper `div` around each child breaks grid
layouts, which is how bento cells and definition lists end up with dead space.

Three separate guards keep content visible, and all three are needed:

1. The component returns a plain `div` under reduced motion, so no animation is
   even scheduled. This uses the project's own `usePrefersReducedMotion` hook.
   Motion's `useReducedMotion` was measured returning `false` while
   `matchMedia('(prefers-reduced-motion: reduce)')` matched, so relying on it
   alone silently hides every section.
2. `globals.css` pins `[data-reveal]` visible inside the reduced-motion media
   query with `!important`, to beat Motion's inline style.
3. The root element carries `no-js` until an inline script flips it, and
   `.no-js [data-reveal]` is pinned visible. Motion writes `opacity: 0` into the
   server HTML, so without this a visitor with no JS runtime sees a blank page.
   A PWA has to render its own content with no network and no runtime.

### Rules

- Animate only `transform` and `opacity`. Never `width`, `height`, `top`, or
  `left`.
- `transition: all` is banned. Name the exact properties.
- Nothing enters from `scale(0)`. Start at `scale(0.96)` with `opacity: 0`.
- Popovers scale from their trigger. Only modals stay centred.
- Hover states sit behind `@media (hover: hover) and (pointer: fine)`.
- `window.addEventListener('scroll')` is banned outright. Use Motion
  `useScroll`, or `IntersectionObserver`.
- Keyboard-initiated actions do not animate at all.
- Toasts use CSS transitions, not keyframes, so a rapid burst retargets instead
  of restarting from zero.

## Accessibility

Target is **WCAG 2.2 AA**, with the hero copy at AAA.

- Contrast: 4.5:1 minimum for body text, 3:1 for large text and non-text UI.
- Focus is never removed. A 2px viridian ring with 2px offset, always visible.
  Sticky bars and overlays never cover a keyboard-focused control.
- Touch targets are 44px minimum, 48px for primary navigation, with 8px between
  adjacent targets.
- The at-risk heatmap encodes each level three ways: colour, pattern fill, and a
  text label. Attendance states pair colour with a distinct glyph. Nothing is
  communicated by colour alone.
- `prefers-reduced-motion` is honoured by both libraries. Under reduced motion
  every section renders in its final readable state and DOM reading order stays
  complete.
- Skip link first in the tab order on every page.
- Forms: visible label, helper below, error below the field linked with
  `aria-describedby`, validation on blur, and a focusable error summary after a
  failed submit.

## Anti-patterns this system bans

- Em dashes in visible copy, anywhere
- Emoji, as prose or as icons
- Section-number eyebrows (`01 /`, `SECTION 03`)
- Scroll cues, decorative status dots, version footers, locale and weather strips
- Filled progress bars used as comparison visuals
- Pills overlaid on images
- More than one marquee per page
- Three identical cards in a row
- Empty cells in a bento grid
- Hand-built div "screenshots" of the product
- More than one eyebrow per three sections

### Known deviation

The landing page runs an eyebrow on all seven sections, which breaks the
"one eyebrow per three sections" rule above. The supplied reference image sets
the topic-label-above-headline rhythm and the approved plan called for it, so the
rule yields to the reference here. The labels are topic words, never section
numbers, which is the part of the rule that actually protects the design.

## Photography

Two raster assets ship in `public/marketing`, both generated and both committed:

| File | Used by | Size |
|---|---|---|
| `liko-report-card.jpg` | the Report cards bento cell | 1600px wide, 101KB |
| `liko-flow-pill.jpg` | the inline photo pill in the Flow headline | 480px wide, 18KB |

Both are local rather than hotlinked. The page is a PWA and must render
identically with no network, and a third party placeholder host would make alt
text a guess. `next.config.ts` therefore has no `remotePatterns` at all.

`scripts/resize-image.ps1` does the resize and re-encode using the System.Drawing
codecs that ship with Windows, so optimising an asset does not add a native
dependency to the project. Pass `-In`, `-Out`, `-Width` and `-Quality`.

The report card cell dropped its `grayscale` filter once the image was on-brand.
The photograph's own viridian pen and green header rule are the accent, and
desaturating them threw away the only thing tying the cell to the palette.

## Verification

| Script | Checks |
|---|---|
| `node scripts/responsive-check.cjs [url]` | Horizontal overflow at 375 / 768 / 1024 / 1440 / 1920, and writes full-page plus per-section screenshots to `.responsive/`. |
| `node scripts/behaviour-check.cjs [url]` | Anchor navigation clears the sticky nav, reduced motion collapses every reveal and the marquee, and nothing is left hidden with JS disabled. |
| `node scripts/verify-logo.cjs` | Logo geometry against the supplied original, under 0.3%. |