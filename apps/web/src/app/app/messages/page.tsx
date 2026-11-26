'use client';
import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Card, Empty, PageTitle } from '@/components/ui';
import { ChatBox } from '@/components/ChatBox';

function Inner() {
  const pre = useSearchParams().get('c');
  const [open, setOpen] = useState<string | null>(null);
  const b = useAsync(() => api.bookings('customer'));
  const cid = pre;
  return (
    <>
      <PageTitle title="Messages" sub="Conversations are tied to your bookings." />
      {cid ? <Card><ChatBox conversationId={cid} /></Card> : null}
      <Async state={b}>{(l) => !l.length ? <Empty title="No conversations yet" body="You can message a professional once you have sent a booking request." /> : (
        <div className="stack">{l.filter((x) => x.status !== 'draft').map((x) => (
          <Card key={x.id} className="flat"><div className="row between"><div><strong>{x.reference}</strong><div className="muted small">{x.description?.slice(0, 80)}</div></div><button className="btn sm secondary" onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? 'Close' : 'Open'}</button></div>{open === x.id ? <div style={{ marginTop: 12 }}><ChatBox bookingId={x.id} /></div> : null}</Card>
        ))}</div>)}</Async>
    </>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
