import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ExploreClient } from '@/components/ExploreClient';
import { Skeleton } from '@/components/ui';
import { getCategories } from '@/lib/server';

type P = { params: Promise<{ category: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category } = await params;
  const name = category.replace(/-/g, ' ');
  return { title: `Hire a ${name} in Kenya`, description: `Compare verified ${name} professionals: prices, reviews and availability.` };
}
export default async function ExploreCategory({ params }: P) {
  const { category } = await params;
  const cats = (await getCategories()) ?? [];
  const cat = cats.find((c) => c.slug === category);
  return (
    <main id="main">
      <div className="wrap" style={{ paddingTop: 24 }}><h1 style={{ fontSize: '2rem' }}>{cat?.name ?? category.replace(/-/g, ' ')}</h1>
        {cat?.requires_license ? <p className="muted">This trade may require a licence. Look for the “Qualified” badge.</p> : null}
        {cat?.services?.length ? <p className="muted small">Common jobs: {cat.services.map((s) => s.name).join(' · ')}</p> : null}
      </div>
      <Suspense fallback={<div className="wrap section"><Skeleton h={140} n={3} /></div>}><ExploreClient fixedCategory={category} categories={cats} /></Suspense>
    </main>
  );
}
