'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle } from '@/components/ui';
import { ReviewForm } from '@/components/ReviewForm';

export default function Reviews() {
  const b = useAsync(() => api.bookings('customer'));
  return (
    <><PageTitle title="Reviews" sub="Rate completed jobs. Only verified bookings can be reviewed, once each." />
      <Async state={b}>{(l) => { const done = l.filter((x) => ['completed', 'settlement_pending', 'settled'].includes(x.status)); return !done.length ? <Empty title="No completed jobs to review yet" /> : <div className="stack">{done.map((x) => <Card key={x.id}><div className="row between"><strong><Link href={`/app/bookings/${x.id}`}>{x.reference}</Link></strong><span className="muted small">{x.description?.slice(0, 60)}</span></div><details><summary className="btn sm secondary" style={{ marginTop: 8 }}>Write a review</summary><div style={{ marginTop: 12 }}><ReviewForm bookingId={x.id} /></div></details></Card>)}</div>; }}</Async></>
  );
}
