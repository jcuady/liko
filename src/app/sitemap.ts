import type { MetadataRoute } from 'next';

import { TERMS_VERSION } from '@/lib/auth/consent';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://liko.app';

/*
 * Every legal document, in one list.
 *
 * A school running a procurement checklist looks for these by URL and finds a
 * missing one, and the ones missing last were the ones nobody indexes. Kept as
 * an array rather than seven literals because the `lastModified` rule below only
 * holds if all seven move together.
 */
const LEGAL_DOCUMENTS = [
  '/terms',
  '/privacy',
  '/cookies',
  '/acceptable-use',
  '/children-privacy',
  '/subprocessors',
  '/dpa',
] as const;

/**
 * Only public routes appear here. The workspace requires a session, so
 * indexing it would advertise a product surface nobody can reach.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    /*
     * The legal documents.
     *
     * Indexed rather than hidden. A privacy notice nobody can find is not a
     * privacy notice, and a terms page that is deliberately unlisted reads as a
     * page nobody is meant to read.
     *
     * `lastModified` is the published version, not the deploy time. The version
     * is what `src/lib/auth/consent.ts` stamps onto a consent record, so the
     * sitemap and the record have to move together, and "whenever we last
     * deployed" would make a change that touched no text look like a change to
     * the text.
     */
    ...LEGAL_DOCUMENTS.map((path) => ({
      url: `${BASE}${path}`,
      lastModified: new Date(`${TERMS_VERSION}T00:00:00Z`),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}