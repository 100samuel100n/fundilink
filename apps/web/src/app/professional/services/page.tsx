'use client';
import React, { useState } from 'react';
import { PRICING_LABEL, kes, type PricingModel } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, Empty, PageTitle, Select, Skeleton, TextArea, TextField } from '@/components/ui';

export default function Services() {
  const t = useToast();
  const me = useAsync(() => api.myProfile());
  const cats = useAsync(() => api.categories());
  const mine = useAsync(async () => { const m = await api.myProfile(); return m.slug ? api.profile(m.slug) : null; });
  const [f, setF] = useState({ serviceId: '', description: '', duration: '60', warranty: '', model: 'fixed' as PricingModel, amount: '', min: '', emergency: '', enabled: true });
  const services = (cats.data ?? []).flatMap((c) => (c.services ?? []).map((s) => ({ value: s.id, label: `${c.name} → ${s.name}` })));
  const save = async () => {
    try {
      await api.upsertService({ serviceId: Number(f.serviceId || services[0]?.value), description: f.description || undefined, durationMinutes: Number(f.duration) || 60, warrantyDays: f.warranty ? Number(f.warranty) : undefined, enabled: f.enabled,
        pricing: [{ model: f.model, amount: f.amount ? Math.round(Number(f.amount) * 100) : undefined, minCharge: f.min ? Math.round(Number(f.min) * 100) : 0, emergencyAmount: f.emergency ? Math.round(Number(f.emergency) * 100) : undefined }] });
      t.ok('Service saved'); mine.reload();
    } catch (e) { t.err(errMsg(e)); }
  };
  const needsAmount = !['quotation', 'project'].includes(f.model);
  return (
    <>
      <PageTitle title="Services & prices" sub="You can offer several pricing models. Customers see prices before they pay." />
      <Async state={me}>{(m) => m.licenceGaps?.length ? <div className="banner" style={{ marginBottom: 16 }}>Licence needed for: {m.licenceGaps.map((g: any) => g.name).join(', ')}. You can still serve other categories; the qualification badge appears after verification.</div> : null}</Async>
      <Async state={mine} skeleton={<Skeleton h={90} />}>{(p) => !p?.services.length ? <Empty title="No services yet" body="Add your first service below." /> : (
        <div className="stack" style={{ marginBottom: 24 }}>{p.services.map((s) => <Card key={s.id} className="flat"><div className="row between"><strong>{s.name}</strong>{s.warranty_days ? <Badge tone="info">{s.warranty_days}d warranty</Badge> : null}</div>{s.pricing.map((x, i) => <div className="small muted" key={i}>{PRICING_LABEL[x.model]}{x.amount != null ? ` · ${kes(x.amount)}` : ''}{x.emergency ? ` · urgent ${kes(x.emergency)}` : ''}</div>)}</Card>)}</div>)}</Async>
      <Card><h3>Add or update a service</h3>
        <Select label="Service" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })} options={services.length ? services : [{ value: '', label: 'Loading…' }]} />
        <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid g3"><Select label="Pricing model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value as PricingModel })} options={Object.entries(PRICING_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          {needsAmount ? <TextField label="Price (KSh)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /> : null}
          <TextField label="Minimum charge (KSh)" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
        <div className="grid g3"><TextField label="Emergency price (KSh)" inputMode="decimal" value={f.emergency} onChange={(e) => setF({ ...f, emergency: e.target.value })} /><TextField label="Typical duration (min)" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /><TextField label="Warranty (days)" inputMode="numeric" value={f.warranty} onChange={(e) => setF({ ...f, warranty: e.target.value })} /></div>
        <Check label="Service is active" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        <Button onClick={save} disabled={needsAmount && !f.amount}>Save service</Button></Card>
    </>
  );
}
