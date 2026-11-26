'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Badge, Button, Card, TextField } from '@/components/ui';
import { ListPage } from '@/components/ListPage';
export default function Locations() {
  const t = useToast(); const [f, setF] = useState({ country: 'KE', county: '', town: '' });
  return <ListPage title="Locations & coverage" sub="Enable counties as supply grows. Add other countries here to expand without code changes." load={() => api.adminX.locations()}
    header={(reload) => <Card style={{ maxWidth: 640, marginBottom: 16 }}><h3>Add a coverage area</h3><div className="row wrap-r">
      <TextField label="Country (ISO)" value={f.country} maxLength={2} onChange={(e) => setF({ ...f, country: e.target.value })} /><TextField label="County / region" value={f.county} onChange={(e) => setF({ ...f, county: e.target.value })} /><TextField label="Town (optional)" value={f.town} onChange={(e) => setF({ ...f, town: e.target.value })} /></div>
      <Button disabled={f.county.length < 2} onClick={async () => { try { await api.adminX.addLocation({ country: f.country, county: f.county, town: f.town || undefined }); t.ok('Added'); setF({ ...f, county: '', town: '' }); reload(); } catch (e) { t.err(errMsg(e)); } }}>Add</Button></Card>}
    cols={(reload) => [{ h: 'Country', cell: (l) => l.country_code }, { h: 'County', cell: (l) => l.county }, { h: 'Active professionals', cell: (l) => l.active_professionals }, { h: 'Status', cell: (l) => <Badge tone={l.enabled ? 'success' : 'neutral'}>{l.enabled ? 'Live' : 'Not live'}</Badge> },
      { h: '', cell: (l) => <Button small tone="secondary" onClick={async () => { try { await api.adminX.setLocation(l.id, !l.enabled); reload(); } catch (e) { t.err(errMsg(e)); } }}>{l.enabled ? 'Disable' : 'Enable'}</Button> }]} />;
}
