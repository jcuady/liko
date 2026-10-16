import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge, getDefaultConfig } from 'tailwind-merge';

/**
 * Merges class names and resolves Tailwind conflicts, so a caller can always
 * override a component's default without `!important`.
 *
 * WHY TAILWIND-MERGE IS TAUGHT THIS PROJECT'S TYPOGRAPHY.
 *
 * `tailwind-merge` resolves conflicts by group, and out of the box it only knows
 * that `text-xs` through `text-9xl` are font sizes. Everything else beginning
 * with `text-` it treats as a colour. The eight typography tokens in
 * `globals.css` are not Tailwind's, so `text-display`, `text-h2`, `text-h3`,
 * `text-h4`, `text-lead`, `text-body`, `text-meta` and `text-label` all landed in
 * the colour group, where two of them conflict and the later one silently wins:
 *
 *     twMerge('text-h4 text-ink')       ->  'text-ink'
 *     twMerge('text-body text-ink-muted')->  'text-ink-muted'
 *
 * The size was deleted before the element was ever created, so nothing in the
 * component could have shown it. The affected call sites were the shared
 * primitives: `CardTitle`, `CardDescription`, `DialogTitle`, `DialogDescription`,
 * `SheetTitle`, `SheetDescription` and `TableCaption`. Every card title, dialog
 * title, sheet title and table caption in the product was rendering at the
 * inherited 16px and regular weight instead of its designed scale, which reads as
 * "a bit plain" rather than as a fault, so no screenshot of one page caught it.
 *
 * A class written as a plain string (`className="text-body text-ink"`) was never
 * affected, which is why some screens looked right and others did not.
 *
 * The fix is here rather than at the seven call sites because the seven are a
 * symptom. The next person to add `text-` to a `cn()` call would have hit it
 * again, and would have had no reason to suspect `cn` of eating one of them.
 */

/** The tokens `globals.css` defines as sizes. Anything beginning `text-` that is
 * not in this list and not a Tailwind t-shirt size is read by tailwind-merge as
 * a colour. */
const TEXT_SIZE_TOKENS = [
  'display',
  'h2',
  'h3',
  'h4',
  'lead',
  'body',
  'meta',
  'label',
];

/**
 * Built from the shipped default rather than a hand-written copy of it.
 *
 * `extend.classGroups` REPLACES a group with the same id, so spelling the
 * font-size group out by hand would mean re-listing Tailwind's own scale and
 * silently dropping `text-[0.9375rem]` the first time that changed. Appending to
 * the default keeps every standard utility working and adds the project tokens
 * to the same group, which is exactly the change in meaning we want.
 */
const defaultConfig = getDefaultConfig();

const withProjectTextSizes = (defaultConfig.classGroups['font-size'] ?? []).map((entry) =>
  entry.text ? { ...entry, text: [...entry.text, ...TEXT_SIZE_TOKENS] } : entry,
);

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': withProjectTextSizes,
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}