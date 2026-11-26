'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Badge, Card, Empty, PageTitle } from '@/components/ui';

export default function Quotations() {
  const p = useAsync(() => api.projects());
  return (
    <><PageTitle title="Quotations & projects" sub="Describe a bigger job, compare quotes and pay by milestone." action={<Link className="btn" href="/app/quotations/new">Request quotations</Link>} />
      <Async state={p}>{(l) => !l.length ? <Empty title="No projects yet" body="Painting a house, roofing, renovation? Let professionals quote." action={<Link className="btn" href="/app/quotations/new">Get started</Link>} /> : (
        <div className="stack">{l.map((x) => <Link key={x.id} href={`/app/quotations/${x.id}`} className="card"><div className="row between"><strong>{x.title}</strong><Badge>{x.status.replace(/_/g, ' ')}</Badge></div><p className="muted small" style={{ margin: 0 }}>{x.address}</p></Link>)}</div>)}</Async></>
  );
}
export { Card };
