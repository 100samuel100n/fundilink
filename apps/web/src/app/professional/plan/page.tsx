'use client';
import { useState } from 'react';
import { kes, newIdempotencyKey } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, Select, TextField } from '@/components/ui';

export default function Plan() {
  const t = useToast(); const plans = useAsync(() => api.plans()); const mine = useAsync(() => api.mySubscription()); const act = useAsync(() => api.activation());
  const [phone, setPhone] = useState(''); const [method, setMethod] = useState<'mpesa' | 'card'>('mpesa'); const [key] = useState(newIdempotencyKey()); const [key2] = useState(newIdempotencyKey());
  return (
    <><PageTitle title="Plan & activation" sub="Plans buy business tools. They never buy ranking, jobs, ratings or verification." />
      <Async state={act}>{(a) => <Card style={{ marginBottom: 20 }}><h3>Activation</h3>
        {a.paid || !a.enabled || a.founding ? <p>{a.founding ? 'You are a founding professional: activation is waived.' : a.paid ? 'Your account is activated.' : 'No activation fee is currently required.'}</p> : <>
          <p>{a.terms} Fee: <b>{kes(a.amount)}</b>, refundable within {a.refundableDays} days in the circumstances set out in the terms.</p>
          <Select label="Pay with" value={method} onChange={(e) => setMethod(e.target.value as any)} options={[{ value: 'mpesa', label: 'M-Pesa' }, { value: 'card', label: 'Card' }]} />{method === 'mpesa' && <TextField label="M-Pesa phone" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          <Button onClick={async () => { try { await api.payActivation({ method, phone: phone || undefined, idempotencyKey: key2 }); t.ok('Check your phone to approve the payment'); act.reload(); } catch (e) { t.err(errMsg(e)); } }}>Pay activation fee</Button></>}</Card>}</Async>
      <Async state={mine}>{(m) => <p className="muted">Current plan: <Badge>{m.name ?? m.plan}</Badge></p>}</Async>
      <Async state={plans}>{(rows) => <div className="grid g3">{rows.map((p) => <Card key={p.code}><h3>{p.name}</h3><p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{Number(p.monthly_amount) ? `${kes(p.monthly_amount)}/mo` : 'Free'}</p>
        <ul className="small">{Object.entries(p.features ?? {}).map(([k, v]) => <li key={k}>{k.replace(/_/g, ' ')}: {String(v)}</li>)}</ul>
        {p.code !== 'free' && <Button tone="secondary" onClick={async () => { try { await api.subscribe({ plan: p.code, method, phone: phone || undefined, idempotencyKey: newIdempotencyKey() }); t.ok('Approve the payment on your phone'); mine.reload(); } catch (e) { t.err(errMsg(e)); } }}>Choose {p.name}</Button>}</Card>)}</div>}</Async>
      <div style={{ marginTop: 12 }}><Button tone="ghost" small onClick={async () => { if (!confirm('Cancel your plan? It stays active until the end of the paid period.')) return; await api.cancelSubscription(); t.ok('Cancelled'); mine.reload(); }}>Cancel plan</Button></div></>
  );
}
