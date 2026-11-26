import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { COUNTIES_FEATURED, slugify } from '@fundilink/sdk';
import { ExploreClient } from '@/components/ExploreClient';
import { JsonLd } from '@/components/JsonLd';
import { Skeleton } from '@/components/ui';
import { getCategories } from '@/lib/server';
import { breadcrumb, pageMeta, titleCase } from '@/lib/seo';

type P = { params: Promise<{ category: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category } = await params;
  const cats = await getCategories();
  const cat = cats?.find((c) => c.slug === category);
  const name = cat?.name ?? titleCase(category);
  return pageMeta({
    title: `${name} professionals in Kenya: compare prices & reviews`,
    description: `Compare verified ${name.toLowerCase()} professionals across Kenya: prices, reviews and availability. Book and pay securely with M-Pesa.`,
    path: `/explore/${category}`, noindex: !!cats?.length && !cat,
  });
}
export default async function ExploreCategory({ params }: P) {
  const { category } = await params;
  const cats = (await getCategories()) ?? [];
  const cat = cats.find((c) => c.slug === category);
  if (cats.length && !cat) notFound();
  const name = cat?.name ?? titleCase(category);
  return (
    <main id="main">
      <JsonLd data={breadcrumb([{ name: 'Home', path: '/' }, { name: 'Find a professional', path: '/explore' }, { name, path: `/explore/${category}` }])} />
      <div className="wrap" style={{ paddingTop: 24 }}><h1 style={{ fontSize: '2rem' }}>{name}</h1>
        {cat?.requires_license ? <p className="muted">This trade may require a licence. Look for the “Qualified” badge.</p> : null}
        {cat?.services?.length ? <p className="muted small">Common jobs: {cat.services.map((s) => s.name).join(' · ')}</p> : null}
      </div>
      <Suspense fallback={<div className="wrap section"><Skeleton h={140} n={3} /></div>}><ExploreClient fixedCategory={category} categories={cats} /></Suspense>
      <div className="wrap section"><h2>{name} near you</h2>
        <div className="chips">{COUNTIES_FEATURED.map((k) => <Link key={k} className="chip" href={`/explore/${category}/${slugify(k)}`}>{name} in {k}</Link>)}</div></div>
    </main>
  );
}