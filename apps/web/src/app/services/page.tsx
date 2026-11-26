import Link from 'next/link';
import type { Metadata } from 'next';
import { getCategories } from '@/lib/server';
import { Card, Empty } from '@/components/ui';
import { CatIcon } from '@/components/Icon';
export const metadata: Metadata = { title: 'All services', description: 'Every service you can book on FundiLink.' };
export const revalidate = 600;
export default async function Services() {
  const cats = (await getCategories()) ?? [];
  return (
    <main id="main" className="wrap section">
      <h1>Services</h1><p className="muted">From emergency plumbing to events, tutoring and consulting. New categories are added without app updates.</p>
      {cats.length === 0 ? <Empty title="Services are loading" body="We could not reach the catalogue just now. Please try again shortly." /> : (
        <div className="grid g2">{cats.map((c) => (
          <Card key={c.id}><h3><span className="row-ic" style={{ color: 'var(--brand-dark)' }}><CatIcon slug={c.slug} size={20} /></span> <Link href={`/explore/${c.slug}`}>{c.name}</Link></h3>
            <p className="muted small">{(c.services ?? []).map((s) => s.name).join(' · ') || 'Browse professionals'}</p>
            {c.requires_license ? <span className="badge warn">Licence checked</span> : null} {c.emergency_capable ? <span className="badge info">Urgent jobs</span> : null}</Card>
        ))}</div>)}
    </main>
  );
}
