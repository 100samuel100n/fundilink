'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Empty, PageTitle, Stars, TextArea } from '@/components/ui';

export default function Reviews() {
  const t = useToast();
  const q = useAsync(() => api.myReviews());
  const [txt, setTxt] = useState<Record<string, string>>({});
  return (
    <><PageTitle title="Reviews" sub="You can respond publicly. Genuine reviews cannot be removed; report abusive ones to support." />
      <Async state={q}>{(list) => !list.length ? <Empty title="No reviews yet" /> : (
        <div className="stack">{list.map((r) => (
          <Card key={r.id}>
            <div className="row between"><Stars value={r.overall} /><span className="muted small">{r.reviewer} · {new Date(r.created_at).toLocaleDateString('en-KE')}</span></div>
            {r.body ? <p>{r.body}</p> : null}
            {r.response ? <p className="card flat small">Your response: {r.response}</p> : null}
            <TextArea label={r.response ? 'Edit your response' : 'Respond publicly'} value={txt[r.id] ?? ''} onChange={(e) => setTxt({ ...txt, [r.id]: e.target.value })} />
            <Button small disabled={(txt[r.id] ?? '').trim().length < 2} onClick={async () => { try { await api.respondToReview(r.id, txt[r.id].trim()); t.ok('Response posted'); setTxt({ ...txt, [r.id]: '' }); q.reload(); } catch (e) { t.err(errMsg(e)); } }}>Post response</Button>
          </Card>
        ))}</div>)}</Async></>
  );
}
