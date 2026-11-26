'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, Chip, Empty, PageTitle, TextField } from '@/components/ui';
import { AddressSearch } from '@/components/AddressSearch';

const LABELS = ['Home', 'Office', 'Rental property', "Parents' home", 'Construction site'];
type Draft = { id?: string; label: string; address: string; notes: string; pt: { lat: number; lng: number } | null };
const blank: Draft = { label: 'Home', address: '', notes: '', pt: null };

export default function Locations() {
  const l = useAsync(() => api.locations());
  const t = useToast();
  const [d, setD] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<{ address: string; rows: any[] } | null>(null);
  const editing = !!d.id;

  const save = async () => {
    if (!d.pt) return;
    setBusy(true);
    try {
      const body = { label: d.label.trim() || 'Home', address: d.address, lat: d.pt.lat, lng: d.pt.lng };
      if (d.id) await api.editLocation(d.id, { ...body, notes: d.notes || null });
      else await api.addLocation({ ...body, notes: d.notes || undefined });
      t.ok(editing ? 'Location updated' : 'Saved'); setD(blank); l.reload();
    } catch (e) { t.err(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this saved location?')) return;
    try { await api.deleteLocation(id); t.ok('Deleted'); if (d.id === id) setD(blank); l.reload(); } catch (e) { t.err(errMsg(e)); }
  };

  return (
    <>
      <PageTitle title="Saved locations" sub="Home, office, rentals, construction sites. Pick one when booking." />
      <Async state={l}>{(rows) => !rows.length ? <Empty title="No saved locations" /> : (
        <div className="grid g2">{rows.map((r) => (
          <Card key={r.id}>
            <h3>{r.label}</h3>
            <p className="muted small">{r.address}</p>
            {r.notes ? <p className="small">{r.notes}</p> : null}
            <div className="row wrap-r">
              <Button small tone="secondary" onClick={() => { setD({ id: r.id, label: r.label, address: r.address, notes: r.notes ?? '', pt: { lat: r.lat, lng: r.lng } }); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}>Edit</Button>
              <Button small tone="secondary" onClick={() => remove(r.id)}>Delete</Button>
              <Button small tone="secondary" onClick={async () => { try { setHist({ address: r.address, rows: await api.propertyHistory(r.address) }); } catch (e) { t.err(errMsg(e)); } }}>Maintenance history</Button>
            </div>
          </Card>))}</div>)}</Async>
      {hist ? <Card style={{ marginTop: 16 }}><h3>History: {hist.address}</h3>{hist.rows.length ? <table><tbody>{hist.rows.map((h, i) => <tr key={i}><td>{new Date(h.completed_at).toLocaleDateString('en-KE')}</td><td>{h.service}</td><td>{h.professional}</td></tr>)}</tbody></table> : <p className="muted">No completed work recorded for this address yet.</p>}</Card> : null}
      <Card style={{ marginTop: 20 }}>
        <h3>{editing ? 'Edit location' : 'Add a location'}</h3>
        <div className="chips">{LABELS.map((x) => <Chip key={x} label={x} on={d.label === x} onClick={() => setD({ ...d, label: x })} />)}</div>
        <TextField label="Label" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        <AddressSearch value={d.address} near={d.pt}
          onChange={(v) => setD((o) => ({ ...o, address: v, pt: null }))}
          onPick={(p) => setD((o) => ({ ...o, address: p.address, pt: { lat: p.lat, lng: p.lng } }))} />
        <p className="small muted">{d.pt ? `Pinned at ${d.pt.lat.toFixed(4)}, ${d.pt.lng.toFixed(4)}` : 'Pick a suggestion so we can pin the exact spot.'}</p>
        <TextField label="Notes (gate code, floor…)" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        <div className="row wrap-r" style={{ marginTop: 12 }}>
          <Button loading={busy} disabled={!d.address || !d.pt} onClick={save}>{editing ? 'Save changes' : 'Save location'}</Button>
          {editing ? <Button tone="secondary" onClick={() => setD(blank)}>Cancel</Button> : null}
        </div>
      </Card>
    </>
  );
}