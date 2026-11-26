import type { MetadataRoute } from 'next';
import { COUNTIES_FEATURED, slugify } from '@fundilink/sdk';
import { getCategories, getSearch } from '@/lib/server';
import { abs } from '@/lib/seo';

export const revalidate = 3600;
type Freq = MetadataRoute.Sitemap[number]['changeFrequency'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cats, pros] = await Promise.all([getCategories(), getSearch({ limit: 100, sort: 'rating' })]);
  const now = new Date();
  const e = (path: string, priority: number, changeFrequency: Freq) => ({ url: abs(path), lastModified: now, changeFrequency, priority });
  const fixed: [string, number, Freq][] = [['/', 1, 'daily'], ['/explore', 0.9, 'daily'], ['/services', 0.9, 'weekly'], ['/locations', 0.8, 'weekly'], ['/emergency', 0.7, 'monthly'],
    ['/for-professionals', 0.7, 'monthly'], ['/for-businesses', 0.6, 'monthly'], ['/how-it-works', 0.5, 'monthly'], ['/about', 0.5, 'monthly'], ['/safety', 0.5, 'monthly'],
    ['/help', 0.5, 'monthly'], ['/contact', 0.4, 'yearly'], ['/terms', 0.3, 'yearly'], ['/privacy', 0.3, 'yearly']];
  return [
    ...fixed.map(([p, pr, f]) => e(p, pr, f)),
    ...(cats ?? []).map((c) => e(`/explore/${c.slug}`, 0.8, 'weekly')),
    ...COUNTIES_FEATURED.map((c) => e(`/locations/${slugify(c)}`, 0.8, 'weekly')),
    ...(cats ?? []).flatMap((c) => COUNTIES_FEATURED.map((k) => e(`/explore/${c.slug}/${slugify(k)}`, 0.7, 'weekly'))),
    ...(pros?.results ?? []).map((p) => e(`/professionals/${p.slug}`, 0.6, 'weekly')),
  ];
}