'use client';
import { useState } from 'react';
import { kes, newIdempotencyKey } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Equipment() {
  const t = useToast(); const [q, setQ] = useState(''); const list = useAsync(() => api.equipment({ q }), [q]); const mine = useAsync(() => api.myRentals());
  const [d, setD] = useState({ from: '', to: '' }); const [phone, setPhone] = useState('');
  return (
    <><PageTitle title="Hire equipment" sub="Ladders, mixers, polishers and more from verified providers. A refundable deposit is held until safe return." />
      <div style={{ maxWidth: 360 }}><TextField label="Search (Enter)" onKeyDown={(e) => { if (e.key === 'Enter') setQ((e.target as HTMLInputElement).value); }} /></div>
      <div className="row wrap-r"><TextField label="From" type="date" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /><TextField label="To" type="date" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /><TextField label="M-Pesa phone (for deposit)" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <Async state={list}>{(rows) => <div className="grid g3">{rows.map((e) => <Card key={e.id}><h3>{e.name}</h3><p className="muted small">{e.owner} · {e.category}{e.distance_km != null ? ` · ${e.distance_km} km` : ''}</p>
        <p>{kes(e.daily_rate)}/day · deposit {kes(e.deposit)}</p>{e.insurance_required && <Badge tone="warning">Insurance required</Badge>}{e.eligibility_notes && <p className="small">{e.eligibility_notes}</p>}
        <Button small disabled={!d.from || !d.to} onClick={async () => { if (!confirm('You agree to the equipment rental terms (care, return condition, deposit).')) return; try { await api.rentEquipment(e.id, d); t.ok('Request sent'); mine.reload(); } catch (x) { t.err(errMsg(x)); } }}>Request to rent</Button></Card>)}</div>}</Async>
      <Card style={{ marginTop: 20 }}><h3>My rentals</h3><Async state={mine}>{(rows) => <DataTable rows={rows} empty="No rentals" cols={[{ h: 'Item', cell: (r) => r.name }, { h: 'Dates', cell: (r) => String(r.period) }, { h: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
        { h: '', cell: (r) => r.status === 'approved' ? <Button small onClick={async () => { try { await api.payRentalDeposit(r.id, { method: 'mpesa', phone: phone || undefined, idempotencyKey: newIdempotencyKey() }); t.ok('Approve the payment on your phone'); mine.reload(); } catch (e) { t.err(errMsg(e)); } }}>Pay {kes(Number(r.rate) + Number(r.deposit))}</Button> : null }]} />}</Async></Card></>
  );
}
