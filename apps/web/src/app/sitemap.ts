import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';
import { getCategories, getSearch } from '@/lib/server';
import { COUNTIES_FEATURED } from '@fundilink/sdk';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cats, pros] = await Promise.all([getCategories(), getSearch({ limit: 100, sort: 'rating' })]);
  const now = new Date();
  const fixed = ['', '/explore', '/services', '/locations', '/how-it-works', '/for-professionals', '/for-businesses', '/about', '/help', '/safety', '/contact', '/terms', '/privacy'];
  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now })),
    ...(cats ?? []).map((c) => ({ url: `${SITE_URL}/explore/${c.slug}`, lastModified: now })),
    ...COUNTIES_FEATURED.map((c) => ({ url: `${SITE_URL}/locations/${c.toLowerCase()}`, lastModified: now })),
    ...(pros?.results ?? []).map((p) => ({ url: `${SITE_URL}/professionals/${p.slug}`, lastModified: now })),
  ];
}
