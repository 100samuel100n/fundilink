'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, getPosition, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Chip, Empty, PageTitle, TextField } from '@/components/ui';

export default function Locations() {
  const l = useAsync(() => api.locations());
  const t = useToast();
  const [f, setF] = useState({ label: 'Home', address: '', notes: '' });
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [hist, setHist] = useState<{ address: string; rows: any[] } | null>(null);
  return (
    <>
      <PageTitle title="Saved locations" sub="Home, office, rentals, construction sites. Pick one when booking." />
      <Async state={l}>{(rows) => !rows.length ? <Empty title="No saved locations" /> : (
        <div className="grid g2">{rows.map((r) => <Card key={r.id}><h3>{r.label}</h3><p className="muted small">{r.address}</p><Button small tone="secondary" onClick={async () => { try { setHist({ address: r.address, rows: await api.propertyHistory(r.address) }); } catch (e) { t.err(errMsg(e)); } }}>Maintenance history</Button></Card>)}</div>)}</Async>
      {hist ? <Card style={{ marginTop: 16 }}><h3>History: {hist.address}</h3>{hist.rows.length ? <table><tbody>{hist.rows.map((h, i) => <tr key={i}><td>{new Date(h.completed_at).toLocaleDateString('en-KE')}</td><td>{h.service}</td><td>{h.professional}</td></tr>)}</tbody></table> : <p className="muted">No completed work recorded for this address yet.</p>}</Card> : null}
      <Card style={{ marginTop: 20 }}><h3>Add a location</h3>
        <div className="chips">{['Home', 'Office', 'Rental property', "Parents' home", 'Construction site'].map((x) => <Chip key={x} label={x} on={f.label === x} onClick={() => setF({ ...f, label: x })} />)}</div>
        <TextField label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <TextField label="Notes (gate code, floor…)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <div className="row wrap-r"><Button tone="secondary" onClick={async () => { try { setPt(await getPosition()); } catch (e) { t.err(errMsg(e)); } }}>Pin my current location</Button><span className="muted small">{pt ? `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}` : 'No pin yet'}</span></div>
        <div style={{ marginTop: 12 }}><Button disabled={!f.address || !pt} onClick={async () => { try { await api.addLocation({ label: f.label, address: f.address, notes: f.notes || undefined, ...pt! }); t.ok('Saved'); setF({ ...f, address: '', notes: '' }); setPt(null); l.reload(); } catch (e) { t.err(errMsg(e)); } }}>Save location</Button></div></Card>
    </>
  );
}
