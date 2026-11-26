'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, TextArea } from '@/components/ui';
import { dt } from '@/components/DataTable';

export default function Warranty() {
  const t = useToast(); const s = useAsync(() => api.warrantyClaims('professional')); const [note, setNote] = useState<Record<string, string>>({});
  const go = async (id: string, decision: 'accepted' | 'declined' | 'resolved') => { try { await api.respondWarranty(id, { decision, response: note[id] || decision }); t.ok('Sent'); s.reload(); } catch (e) { t.err(errMsg(e)); } };
  return (
    <><PageTitle title="Warranty claims" sub="Set warranty days per service under Services & prices. Declined claims can be escalated by the customer to a dispute officer." />
      <Async state={s}>{(rows) => rows.length ? <div className="stack">{rows.map((c) => <Card key={c.id}><div className="row between"><b>{c.reference}</b><Badge>{c.status}</Badge></div><p>{c.description}</p><p className="muted small">{dt(c.created_at)}</p>
        {c.status === 'submitted' && <><TextArea label="Your response" value={note[c.id] ?? ''} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} /><div className="row"><Button small onClick={() => go(c.id, 'accepted')}>Accept & fix</Button><Button small tone="danger" onClick={() => go(c.id, 'declined')}>Decline</Button></div></>}
        {c.status === 'accepted' && <Button small onClick={() => go(c.id, 'resolved')}>Mark resolved</Button>}</Card>)}</div> : <p className="muted">No warranty claims.</p>}</Async></>
  );
}
