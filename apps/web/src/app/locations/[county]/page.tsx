import Link from 'next/link';
import type { Metadata } from 'next';
import { placesInCounty, resolveLocation, slugify } from '@fundilink/sdk';
import { getCategories, getSearch } from '@/lib/server';
import { ProCardView } from '@/components/ProCard';
import { Empty } from '@/components/ui';
import { CatIcon } from '@/components/Icon';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumb, itemList, pageMeta } from '@/lib/seo';

type P = { params: Promise<{ county: string }> };

const pretty = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { county } = await params;
  const loc = resolveLocation(county);
  if (!loc) return { title: 'Not found', robots: { index: false, follow: false } };
  return pageMeta({
    title: `Plumbers, electricians & cleaners in ${loc.name}`,
    description: `Hire verified home and trade professionals in ${loc.name}${loc.kind !== 'county' ? `, ${loc.county}` : ''}. Compare prices and reviews, then book and pay securely with M-Pesa.`,
    path: `/locations/${county}`,
  });
}

export default async function County({ params }: P) {
  const { county } = await params;
  const loc = resolveLocation(county);
  if (!loc) notFound();
  const name = loc?.name ?? pretty(county);
  const c = loc ?? undefined;
  const towns = loc ? placesInCounty(loc.county).filter((t) => t.name !== name) : [];
  const [cats, res] = await Promise.all([getCategories(), getSearch({ ...(c ? { lat: c.lat, lng: c.lng, radiusKm: loc?.kind === 'county' ? 40 : 15 } : {}), sort: 'rating', limit: 12 })]);
  return (
    <main id="main" className="wrap section"><h1>Professionals in {name}</h1>
    <JsonLd data={[breadcrumb([{ name: 'Home', path: '/' }, { name: 'Locations', path: '/locations' }, { name, path: `/locations/${county}` }]), itemList(`Professionals in ${name}`, (res?.results ?? []).map((p: any) => ({ name: p.name, path: `/professionals/${p.slug}` })))]} />
      {loc && loc.kind !== 'county' ? <p className="muted">{loc.county} County</p> : null}
      {towns.length ? <div className="chips" style={{ marginBottom: 16 }} aria-label="Towns and estates">{towns.map((t) => <Link key={t.name} className="chip" href={`/locations/${slugify(t.name)}`}>{t.name}</Link>)}</div> : null}
      <div className="chips" style={{ marginBottom: 20 }}>{(cats ?? []).slice(0, 12).map((k) => <Link key={k.id} className="chip" href={`/explore/${k.slug}/county}`}><CatIcon slug={k.slug} size={16} /> {k.name}</Link>)}</div>
      {res?.results.length ? <div className="grid g2">{res.results.map((p) => <ProCardView key={p.id} pro={p} />)}</div> : <Empty title={`We are onboarding professionals in ${name}`} body="Request a quotation and we will notify professionals as they join." action={<Link className="btn" href="/app/quotations/new">Request a quotation</Link>} />}
    </main>
  );
}
