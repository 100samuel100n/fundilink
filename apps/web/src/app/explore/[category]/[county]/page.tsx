import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { COUNTIES_FEATURED, resolveLocation, slugify } from '@fundilink/sdk';
import { getCategories, getSearch } from '@/lib/server';
import { ProCardView } from '@/components/ProCard';
import { JsonLd } from '@/components/JsonLd';
import { LinkButton, StateCard } from '@/components/ui';
import { abs, breadcrumb, faqLd, itemList, pageMeta } from '@/lib/seo';

type P = { params: Promise<{ category: string; county: string }> };
export const revalidate = 600;

export async function generateStaticParams() {
  const cats = (await getCategories()) ?? [];
  return cats.flatMap((c) => COUNTIES_FEATURED.map((k) => ({ category: c.slug, county: slugify(k) })));
}
async function load(params: P['params']) {
  const { category, county } = await params;
  const cats = (await getCategories()) ?? [];
  return { category, county, cats, cat: cats.find((c) => c.slug === category), loc: resolveLocation(county) };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { category, county, cat, loc } = await load(params);
  if (!cat || !loc) return { title: 'Not found', robots: { index: false, follow: false } };
  return pageMeta({
    title: `${cat.name} in ${loc.name}: verified professionals, prices & reviews`,
    description: `Compare verified ${cat.name.toLowerCase()} professionals in ${loc.name}. See prices, reviews and availability, then book and pay securely with M-Pesa.`,
    path: `/explore/${category}/${county}`,
  });
}

export default async function CategoryInPlace({ params }: P) {
  const { category, county, cats, cat, loc } = await load(params);
  if (!cat || !loc) notFound();
  const res = await getSearch({ category, lat: loc.lat, lng: loc.lng, radiusKm: loc.kind === 'county' ? 40 : 15, sort: 'rating', limit: 12 });
  const pros = res?.results ?? [];
  const path = `/explore/${category}/${county}`;
  const nm = cat.name;
  const faqs = [
    { q: `How do I hire a ${nm.toLowerCase()} professional in ${loc.name}?`, a: `Browse verified ${nm.toLowerCase()} professionals, compare prices and reviews, choose a time and book. For bigger jobs you can request a quotation first.` },
    { q: 'Are professionals on FundiLink verified?', a: 'Identity, qualification and business checks are shown as separate badges, so you can see exactly what has been verified. Badges are never bought.' },
    { q: 'How do I pay?', a: 'Pay with M-Pesa. Your payment is held until you confirm the work is done, or you can pay on site where the professional allows it.' },
  ];
  const others = COUNTIES_FEATURED.filter((k) => slugify(k) !== county).slice(0, 8);
  return (
    <main id="main" className="wrap section">
      <JsonLd data={[
        breadcrumb([{ name: 'Home', path: '/' }, { name: 'Find a professional', path: '/explore' }, { name: nm, path: `/explore/${category}` }, { name: loc.name, path }]),
        itemList(`${nm} in ${loc.name}`, pros.map((p: any) => ({ name: p.name, path: `/professionals/${p.slug}` }))),
        { '@context': 'https://schema.org', '@type': 'Service', serviceType: nm, areaServed: { '@type': 'AdministrativeArea', name: loc.name }, provider: { '@id': abs('/#org') } },
        faqLd(faqs),
      ]} />
      <h1>{nm} professionals in {loc.name}</h1>
      <p className="muted">Compare prices, reviews and availability from verified {nm.toLowerCase()} professionals{loc.kind !== 'county' ? `, ${loc.county}` : ''}.</p>
      {cat.services?.length ? <p className="muted small">Common jobs: {cat.services.map((s) => s.name).join(' · ')}</p> : null}
      {pros.length ? <div className="grid g2" style={{ marginTop: 16 }}>{pros.map((p) => <ProCardView key={p.id} pro={p} />)}</div> : (
        <StateCard icon="search" title={`We are onboarding ${nm.toLowerCase()} professionals in ${loc.name}`} body="Request a quotation and we will notify professionals as they join."
          actions={<LinkButton href="/app/quotations/new">Request a quotation</LinkButton>} />
      )}
      <h2 style={{ marginTop: 32 }}>{nm} in other places</h2>
      <div className="chips">{others.map((k) => <Link key={k} className="chip" href={`/explore/${category}/${slugify(k)}`}>{nm} in {k}</Link>)}</div>
      <h2 style={{ marginTop: 28 }}>More services in {loc.name}</h2>
      <div className="chips">{cats.filter((c) => c.slug !== category).slice(0, 12).map((c) => <Link key={c.id} className="chip" href={`/explore/${c.slug}/${county}`}>{c.name}</Link>)}</div>
      <h2 style={{ marginTop: 28 }}>Common questions</h2>
      <div className="stack">{faqs.map((f) => <details key={f.q} className="card"><summary><strong>{f.q}</strong></summary><p className="muted">{f.a}</p></details>)}</div>
    </main>
  );
}