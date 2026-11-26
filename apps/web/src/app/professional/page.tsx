'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Badge, Card, Money, PageTitle, Skeleton, Stat } from '@/components/ui';
import { BookingGrid } from '@/components/BookingList';

export default function Overview() {
  const o = useAsync(() => api.proOverview());
  const a = useAsync(() => api.proAnalytics());
  const b = useAsync(() => api.bookings('professional'));
  return (
    <>
      <PageTitle title="Overview" />
      <Async state={o} skeleton={<Skeleton h={90} />}>{(d) => (
        <>
          {d.status !== 'active' ? <div className="banner" style={{ marginBottom: 16 }}>Account status: <strong>{d.status}</strong>. {d.status === 'pending' || d.status === 'pending_verification' ? 'Our team is reviewing your profile. You can keep setting up meanwhile.' : ''}</div> : null}
          <div className="grid g4">
            <Stat n={d.today} l="Today’s bookings" /><Stat n={d.pending_requests} l="Pending requests" /><Stat n={<Money minor={d.month_earnings} />} l="This month" /><Stat n={`${Number(d.rating).toFixed(1)} ★`} l={`${d.reviews} reviews`} />
          </div></>
      )}</Async>
      <h2 style={{ marginTop: 28 }}>Performance</h2>
      <Async state={a} skeleton={<Skeleton h={90} />}>{(d) => <div className="grid g4"><Stat n={d.completedJobs} l="Completed jobs" /><Stat n={d.bookings} l="Bookings (90d)" /><Stat n={<Money minor={d.avg_value} />} l="Avg booking value" /><Stat n={`${d.cancellationRate}%`} l="Cancellation rate" /></div>}</Async>
      <h2 style={{ marginTop: 28 }}>Latest bookings</h2>
      <Async state={b} skeleton={<Skeleton h={80} n={2} />}>{(l) => <BookingGrid list={l.slice(0, 5)} base="/professional/bookings" empty={<Card className="flat"><p className="muted">No bookings yet. Complete your services and profile so customers can find you. <Link href="/professional/services">Add services</Link></p></Card>} />}</Async>
      <p className="muted small" style={{ marginTop: 16 }}><Badge>Tip</Badge> Fast replies and a complete portfolio raise your visibility. Paying never does.</p>
    </>
  );
}
