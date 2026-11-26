'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle, Skeleton } from '@/components/ui';
import { ACTIVE, BookingGrid } from '@/components/BookingList';

export default function Dashboard() {
  const b = useAsync(() => api.bookings('customer'));
  const n = useAsync(() => api.notifications());
  return (
    <>
      <PageTitle title="Overview" sub="Your bookings, projects and alerts." action={<Link className="btn" href="/explore">Find a professional</Link>} />
      <h2>Active bookings</h2>
      <Async state={b} skeleton={<Skeleton h={90} n={2} />}>{(l) => <BookingGrid list={l.filter((x) => ACTIVE.includes(x.status))} base="/app/bookings" empty={<Empty title="No active bookings" body="Search for a professional to get started." action={<Link className="btn" href="/explore">Browse</Link>} />} />}</Async>
      <h2 style={{ marginTop: 28 }}>Recent alerts</h2>
      <Async state={n} skeleton={<Skeleton h={60} n={2} />}>{(l) => l.length ? <div className="stack">{l.slice(0, 5).map((x) => <Card key={x.id} className="flat"><strong>{x.title}</strong><p className="muted small" style={{ margin: 0 }}>{x.body}</p></Card>)}</div> : <p className="muted">Nothing new.</p>}</Async>
    </>
  );
}
