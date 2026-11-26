import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ExploreClient } from '@/components/ExploreClient';
import { Skeleton } from '@/components/ui';
import { getCategories } from '@/lib/server';

export const metadata: Metadata = { title: 'Find a professional', description: 'Search and compare verified service professionals near you.' };
export default async function Explore() {
  const cats = (await getCategories()) ?? [];
  return <main id="main"><Suspense fallback={<div className="wrap section"><Skeleton h={140} n={3} /></div>}><ExploreClient categories={cats} /></Suspense></main>;
}
