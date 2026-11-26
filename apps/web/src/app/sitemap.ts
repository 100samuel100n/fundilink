import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';
import { getCategories, getSearch } from '@/lib/server';
import { COUNTIES_FEATURED } from '@fundilink/sdk';

// 1. Skip static generation during `next build` and render on request
export const dynamic = 'force-dynamic';

// Helper to prevent hanging if the backend API is slow or unreachable
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 2. Fail fast after 5 seconds and fall back to static routes
  const [cats, pros] = await Promise.all([
    withTimeout(getCategories(), 5000, []),
    withTimeout(getSearch({ limit: 100, sort: 'rating' }), 5000, { results: [] }),
  ]);

  const now = new Date();
  const fixed = [
    '',
    '/explore',
    '/services',
    '/locations',
    '/how-it-works',
    '/for-professionals',
    '/for-businesses',
    '/about',
    '/help',
    '/safety',
    '/contact',
    '/terms',
    '/privacy',
  ];

  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now })),
    ...(cats ?? []).map((c) => ({ url: `${SITE_URL}/explore/${c.slug}`, lastModified: now })),
    ...COUNTIES_FEATURED.map((c) => ({ url: `${SITE_URL}/locations/${c.toLowerCase()}`, lastModified: now })),
    ...(pros?.results ?? []).map((p) => ({ url: `${SITE_URL}/professionals/${p.slug}`, lastModified: now })),
  ];
}
