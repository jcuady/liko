import type { MetadataRoute } from 'next';

import { TERMS_VERSION } from '@/lib/auth/consent';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://liko.app';

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
    {
      url: `${BASE}/terms`,
      lastModified: new Date(`${TERMS_VERSION}T00:00:00Z`),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: new Date(`${TERMS_VERSION}T00:00:00Z`),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE}/cookies`,
      lastModified: new Date(`${TERMS_VERSION}T00:00:00Z`),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}