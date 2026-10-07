import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://liko.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The workspace, auth flows, and API surface have nothing useful to
        // offer a crawler and should not consume crawl budget.
        disallow: ['/overview', '/classes', '/attendance', '/plan', '/assess', '/grades', '/history', '/settings', '/api/', '/login', '/register'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}