'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle } from '@/components/ui';

export default function Quotations() {
  const n = useAsync(() => api.notifications());
  return (
    <><PageTitle title="Quotation requests" sub="Customers near you asking for quotes." />
      <Async state={n}>{(l) => { const q = l.filter((x) => x.template === 'quote_request'); return !q.length ? <Empty title="No quotation requests" /> : <div className="stack">{q.map((x) => <Card key={x.id}><strong>{x.body}</strong><div style={{ marginTop: 8 }}><Link className="btn sm" href={`/professional/quotations/${x.data?.quotationId ?? x.data?.projectId}`}>Prepare quotation</Link></div></Card>)}</div>; }}</Async></>
  );
}
