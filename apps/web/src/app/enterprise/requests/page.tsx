'use client';
import React, { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { useOrg } from '@/components/Org';
import { Async, Badge, Button, Card, Empty, PageTitle, Select, TextArea, TextField } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Requests() {
  const org = useOrg()!; const t = useToast();
  const r = useAsync(() => api.maintenanceRequests(org.id), [org.id]);
  const props = useAsync(() => api.properties(org.id), [org.id]);
  const cats = useAsync(() => api.categories());
  const [f, setF] = useState({ propertyId: '', categoryId: '', title: '', description: '', priority: 'normal', cost: '' });
  const canApprove = ['owner', 'admin', 'approver', 'manager'].includes(org.role);
  return (
    <><PageTitle title="Maintenance requests" sub="Reported problems, routed through approval before a professional is booked." />
      <Async state={r}>{(rows) => <DataTable rows={rows} empty="No requests" cols={[{ h: 'Title', cell: (x) => <><strong>{x.title}</strong><div className="muted small">{x.property}</div></> }, { h: 'Priority', cell: (x) => <Badge tone={x.priority === 'urgent' ? 'bad' : x.priority === 'high' ? 'warn' : 'neutral'}>{x.priority}</Badge> }, { h: 'Est. cost', cell: (x) => (x.estimated_cost ? kes(x.estimated_cost) : '—') }, { h: 'Status', cell: (x) => <Badge>{x.status}</Badge> }, { h: 'Raised', cell: (x) => dt(x.created_at) },
        { h: '', cell: (x) => canApprove && ['pending', 'pending_approval', 'submitted'].includes(x.status) ? <Button small onClick={async () => { try { await api.approveRequest(x.id); t.ok('Approved'); r.reload(); } catch (e) { t.err(errMsg(e)); } }}>Approve spend</Button> : null }]} />}</Async>
      <Card style={{ marginTop: 20 }}><h3>New request</h3>
        <Async state={props}>{(pl) => !pl.length ? <Empty title="Add a property first" /> : <>
          <Select label="Property" value={f.propertyId || pl[0].id} onChange={(e) => setF({ ...f, propertyId: e.target.value })} options={pl.map((p: any) => ({ value: p.id, label: p.name }))} />
          <Select label="Category" value={f.categoryId || String(cats.data?.[0]?.id ?? '')} onChange={(e) => setF({ ...f, categoryId: e.target.value })} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><TextArea label="Details" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid g2"><Select label="Priority" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} options={['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v }))} /><TextField label="Estimated cost (KSh)" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></div>
          <Button disabled={f.title.length < 3} onClick={async () => { try { await api.maintenanceRequest(org.id, { propertyId: f.propertyId || pl[0].id, categoryId: Number(f.categoryId || cats.data?.[0]?.id), title: f.title, description: f.description || undefined, priority: f.priority as any, estimatedCost: f.cost ? Math.round(Number(f.cost) * 100) : undefined }); t.ok('Request created'); setF({ ...f, title: '', description: '', cost: '' }); r.reload(); } catch (e) { t.err(errMsg(e)); } }}>Create request</Button></>}</Async></Card></>
  );
}
