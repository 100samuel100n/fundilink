import Link from 'next/link';
import type { Metadata } from 'next';
import { COUNTIES, placesInCounty, resolveLocation, slugify } from '@fundilink/sdk';
import { getCategories, getSearch } from '@/lib/server';
import { ProCardView } from '@/components/ProCard';
import { Empty } from '@/components/ui';
import { CatIcon } from '@/components/Icon';

type P = { params: Promise<{ county: string }> };
void COUNTIES;
const pretty = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
export async function generateMetadata({ params }: P): Promise<Metadata> { const { county } = await params; return { title: `Professionals in ${pretty(county)}`, description: `Hire verified plumbers, electricians, cleaners and more in ${pretty(county)}.` }; }
export default async function County({ params }: P) {
  const { county } = await params;
  const loc = resolveLocation(county);
  const name = loc?.name ?? pretty(county);
  const c = loc ?? undefined;
  const towns = loc ? placesInCounty(loc.county).filter((t) => t.name !== name) : [];
  const [cats, res] = await Promise.all([getCategories(), getSearch({ ...(c ? { lat: c.lat, lng: c.lng, radiusKm: loc?.kind === 'county' ? 40 : 15 } : {}), sort: 'rating', limit: 12 })]);
  return (
    <main id="main" className="wrap section"><h1>Professionals in {name}</h1>
      {loc && loc.kind !== 'county' ? <p className="muted">{loc.county} County</p> : null}
      {towns.length ? <div className="chips" style={{ marginBottom: 16 }} aria-label="Towns and estates">{towns.map((t) => <Link key={t.name} className="chip" href={`/locations/${slugify(t.name)}`}>{t.name}</Link>)}</div> : null}
      <div className="chips" style={{ marginBottom: 20 }}>{(cats ?? []).slice(0, 12).map((k) => <Link key={k.id} className="chip" href={`/explore/${k.slug}?county=${loc?.county ?? name}`}><CatIcon slug={k.slug} size={16} /> {k.name}</Link>)}</div>
      {res?.results.length ? <div className="grid g2">{res.results.map((p) => <ProCardView key={p.id} pro={p} />)}</div> : <Empty title={`We are onboarding professionals in ${name}`} body="Request a quotation and we will notify professionals as they join." action={<Link className="btn" href="/app/quotations/new">Request a quotation</Link>} />}
    </main>
  );
}
