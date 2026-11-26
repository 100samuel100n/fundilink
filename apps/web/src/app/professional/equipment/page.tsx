'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, PageTitle, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Equipment() {
  const t = useToast(); const s = useAsync(() => api.myEquipment());
  const [f, setF] = useState({ name: '', category: '', daily: '', deposit: '', notes: '', insurance: false });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); t.ok(ok); s.reload(); } catch (e) { t.err(errMsg(e)); } };
  return (
    <><PageTitle title="Equipment for hire" sub="Rentals have their own terms, a refundable deposit and optional insurance. Overlapping rentals are blocked by the database." />
      <Card style={{ maxWidth: 560, marginBottom: 20 }}><h3>List equipment</h3>
        <TextField label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><TextField label="Category (ladder, concrete mixer, floor polisher…)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <div className="row wrap-r"><TextField label="Daily rate (KSh)" inputMode="decimal" value={f.daily} onChange={(e) => setF({ ...f, daily: e.target.value })} /><TextField label="Deposit (KSh)" inputMode="decimal" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value })} /></div>
        <TextField label="Eligibility notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /><Check label="Renter must have insurance" checked={f.insurance} onChange={(e) => setF({ ...f, insurance: e.target.checked })} />
        <Button disabled={!f.name || !f.category || !Number(f.daily)} onClick={() => run(() => api.createEquipment({ name: f.name, category: f.category, dailyRate: Math.round(Number(f.daily) * 100), deposit: Math.round(Number(f.deposit || 0) * 100), eligibilityNotes: f.notes || undefined, insuranceRequired: f.insurance }), 'Listed')}>List</Button></Card>
      <Async state={s}>{(d) => (<div className="stack" style={{ gap: 20 }}>
        <DataTable rows={d.listings} empty="Nothing listed" cols={[{ h: 'Item', cell: (e) => e.name }, { h: 'Daily', cell: (e) => kes(e.daily_rate) }, { h: 'Deposit', cell: (e) => kes(e.deposit) }, { h: 'Live', cell: (e) => <Badge tone={e.active ? 'success' : 'neutral'}>{e.active ? 'Yes' : 'Paused'}</Badge> }, { h: '', cell: (e) => <Button small tone="secondary" onClick={() => run(() => api.toggleEquipment(e.id), 'Updated')}>{e.active ? 'Pause' : 'Resume'}</Button> }]} />
        <Card><h3>Rental requests</h3><DataTable rows={d.incoming} empty="No requests" cols={[{ h: 'Item', cell: (r) => r.name }, { h: 'Renter', cell: (r) => r.renter }, { h: 'Dates', cell: (r) => String(r.period) }, { h: 'Status', cell: (r) => <Badge>{r.status}</Badge> },
          { h: '', cell: (r) => r.status === 'requested' ? <div className="row"><Button small onClick={() => run(() => api.decideRental(r.id, true), 'Approved')}>Approve</Button><Button small tone="danger" onClick={() => run(() => api.decideRental(r.id, false), 'Declined')}>Decline</Button></div> : r.status === 'active' ? <Button small onClick={() => run(() => api.returnRental(r.id), 'Returned, deposit refunded')}>Mark returned</Button> : null }]} /></Card></div>)}</Async></>
  );
}
