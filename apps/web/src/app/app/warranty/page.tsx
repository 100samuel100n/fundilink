'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, Select, TextArea } from '@/components/ui';

export default function Warranty() {
  const t = useToast(); const claims = useAsync(() => api.warrantyClaims('customer')); const bk = useAsync(() => api.bookings('customer'));
  const [f, setF] = useState({ bookingId: '', description: '' });
  const done = (bk.data ?? []).filter((b: any) => ['completed', 'settled', 'settlement_pending'].includes(b.status));
  return (
    <><PageTitle title="Warranty claims" sub="Claim within the warranty period the professional offered. If they decline, you can escalate to our dispute team." />
      <Card style={{ maxWidth: 560, marginBottom: 20 }}><h3>Report a problem with finished work</h3>
        <Select label="Booking" value={f.bookingId} onChange={(e) => setF({ ...f, bookingId: e.target.value })} options={[{ value: '', label: 'Choose…' }, ...done.map((b: any) => ({ value: b.id, label: `${b.reference}` }))]} />
        <TextArea label="What went wrong?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Button disabled={!f.bookingId || f.description.length < 10} onClick={async () => { try { await api.claimWarranty(f); t.ok('Claim sent'); setF({ bookingId: '', description: '' }); claims.reload(); } catch (e) { t.err(errMsg(e)); } }}>Submit claim</Button></Card>
      <Async state={claims}>{(rows) => <div className="stack">{rows.map((c) => <Card key={c.id}><div className="row between"><b>{c.reference}</b><Badge>{c.status}</Badge></div><p>{c.description}</p>{c.professional_response && <p className="muted small">Professional: {c.professional_response}</p>}
        {c.status === 'declined' && <Button small tone="secondary" onClick={async () => { await api.escalateWarranty(c.id); t.ok('Escalated'); claims.reload(); }}>Escalate to dispute team</Button>}</Card>)}</div>}</Async></>
  );
}
