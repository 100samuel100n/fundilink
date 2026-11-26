'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { Async, Card, PageTitle, Select } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Properties() {
  const locs = useAsync(() => api.locations()); const [addr, setAddr] = useState('');
  const hist = useAsync(async () => (addr ? api.propertyHistory(addr) : []), [addr]);
  return (
    <><PageTitle title="My property history" sub="A running record of work done at each of your properties." />
      <Async state={locs}>{(l) => <div style={{ maxWidth: 420 }}><Select label="Property" value={addr} onChange={(e) => setAddr(e.target.value)} options={[{ value: '', label: 'Choose a saved location…' }, ...l.map((x) => ({ value: x.address, label: `${x.label}: ${x.address}` }))]} /></div>}</Async>
      <Card style={{ marginTop: 16 }}><Async state={hist}>{(rows) => <DataTable rows={rows.map((r, i) => ({ ...r, id: i }))} empty={addr ? 'No completed work yet at this address' : 'Choose a property'} cols={[{ h: 'Date', cell: (r) => dt(r.completed_at) }, { h: 'Service', cell: (r) => r.service }, { h: 'Professional', cell: (r) => r.professional }]} />}</Async></Card></>
  );
}
