'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { useOrg } from '@/components/Org';
import { Button, Card, Empty, PageTitle, Select, TextField } from '@/components/ui';

const PRESETS = [['Weekly', 'FREQ=WEEKLY'], ['Monthly', 'FREQ=MONTHLY'], ['Quarterly', 'FREQ=MONTHLY;INTERVAL=3']];
export default function Contracts() {
  const org = useOrg()!; const t = useToast();
  const props = useAsync(() => api.properties(org.id), [org.id]);
  const cats = useAsync(() => api.categories());
  const [f, setF] = useState({ propertyId: '', serviceId: '', q: '', professionalId: '', rrule: PRESETS[1][1], amount: '', startsOn: new Date().toISOString().slice(0, 10) });
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const services = (cats.data ?? []).flatMap((c) => (c.services ?? []).map((s) => ({ value: s.id, label: `${c.name} → ${s.name}` })));
  return (
    <><PageTitle title="Recurring contracts" sub="Weekly cleaning, monthly pest control, quarterly inspections. Service orders are generated automatically." />
      <Card><h3>New contract</h3>
        {!props.data?.length ? <Empty title="Add a property first" /> : <>
          <Select label="Property" value={f.propertyId || props.data[0].id} onChange={(e) => setF({ ...f, propertyId: e.target.value })} options={props.data.map((p: any) => ({ value: p.id, label: p.name }))} />
          <Select label="Service" value={f.serviceId || String(services[0]?.value ?? '')} onChange={(e) => setF({ ...f, serviceId: e.target.value })} options={services} />
          <div className="row" style={{ alignItems: 'flex-end' }}><div style={{ flex: 1 }}><TextField label="Find a professional" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div><Button tone="secondary" style={{ marginBottom: 12 }} onClick={async () => { try { const r = await api.search({ q: f.q, limit: 6 }); setFound(r.results.map((p) => ({ id: p.id, name: p.businessName ?? p.name }))); } catch (e) { t.err(errMsg(e)); } }}>Search</Button></div>
          {found.length ? <Select label="Professional" value={f.professionalId} onChange={(e) => setF({ ...f, professionalId: e.target.value })} options={[{ value: '', label: 'Choose…' }, ...found.map((p) => ({ value: p.id, label: p.name }))]} /> : null}
          <Select label="Frequency" value={f.rrule} onChange={(e) => setF({ ...f, rrule: e.target.value })} options={PRESETS.map(([l, v]) => ({ value: v, label: l }))} />
          <div className="grid g2"><TextField label="Amount per visit (KSh)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /><TextField label="Starts on" type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></div>
          <Button disabled={!f.professionalId || !Number(f.amount)} onClick={async () => { try { await api.createContract(org.id, { propertyId: f.propertyId || props.data![0].id, professionalId: f.professionalId, serviceId: Number(f.serviceId || services[0]?.value), rrule: f.rrule, amount: Math.round(Number(f.amount) * 100), startsOn: f.startsOn }); t.ok('Contract created'); } catch (e) { t.err(errMsg(e)); } }}>Create contract</Button></>}
      </Card><p className="small muted">Existing contracts will be listed here once the API exposes a list endpoint.</p></>
  );
}
