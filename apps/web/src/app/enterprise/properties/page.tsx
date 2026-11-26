'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { useOrg } from '@/components/Org';
import { AddressSearch } from '@/components/AddressSearch';
import { Async, Button, Card, Empty, PageTitle, TextArea, TextField } from '@/components/ui';

export default function Properties() {
  const org = useOrg()!; const t = useToast();
  const p = useAsync(() => api.properties(org.id), [org.id]);
  const [f, setF] = useState({ name: '', address: '', units: '' });
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <><PageTitle title="Properties" sub="Buildings and units you manage." />
      <Async state={p}>{(l) => !l.length ? <Empty title="No properties yet" /> : <div className="grid g2">{l.map((x: any) => <Card key={x.id}><h3>{x.name}</h3><p className="muted small">{x.address}</p><p className="small">{x.unit_count ?? x.units?.length ?? ''} {x.unit_count != null || x.units ? 'units' : ''}</p></Card>)}</div>}</Async>
      <Card style={{ marginTop: 20 }}><h3>Add a property</h3>
        <AddressSearch value={f.address} near={pt}
  onChange={(v) => { setF((o) => ({ ...o, address: v })); setPt(null); }}
  onPick={(p) => { setF((o) => ({ ...o, address: p.address })); setPt({ lat: p.lat, lng: p.lng }); }} />
        <TextArea label="Units (one per line, optional)" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} />
        <div className="row wrap-r"><Button tone="secondary" small onClick={async () => { try { setPt(await getPosition()); } catch (e) { t.err(errMsg(e)); } }}>Pin location</Button><span className="muted small">{pt ? `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}` : 'Optional'}</span></div>
        <div style={{ marginTop: 12 }}><Button disabled={f.name.length < 2 || !f.address} onClick={async () => { try { await api.addProperty(org.id, { name: f.name, address: f.address, ...(pt ?? {}), units: f.units.split('\n').map((s) => s.trim()).filter(Boolean).map((label) => ({ label })) }); t.ok('Property added'); setF({ name: '', address: '', units: '' }); p.reload(); } catch (e) { t.err(errMsg(e)); } }}>Add property</Button></div></Card></>
  );
}
