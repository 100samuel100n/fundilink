'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/components/Org';
import { Async, Button, PageTitle, TextField } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Statements() {
  const org = useOrg(); const [r, setR] = useState({ from: '', to: '' });
  const s = useAsync(() => (org ? api.orgStatement(org.id, { from: r.from || undefined, to: r.to || undefined }) : Promise.resolve([])), [org?.id, r.from, r.to]);
  const hist = useAsync(() => (org ? api.orgHistory(org.id) : Promise.resolve([])), [org?.id]);
  if (!org) return null;
  const csv = (rows: any[]) => { const k = Object.keys(rows[0] ?? {}); const body = [k.join(','), ...rows.map((x) => k.map((c) => `"${String(x[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); const u = URL.createObjectURL(new Blob([body], { type: 'text/csv' })); const a = document.createElement('a'); a.href = u; a.download = 'statement.csv'; a.click(); URL.revokeObjectURL(u); };
  return (
    <><PageTitle title="Invoices & statements" sub="Downloadable statements and full maintenance history." />
      <div className="row wrap-r"><TextField label="From" type="date" value={r.from} onChange={(e) => setR({ ...r, from: e.target.value })} /><TextField label="To" type="date" value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} /></div>
      <Async state={s}>{(rows) => <><Button small tone="secondary" disabled={!rows.length} onClick={() => csv(rows)}>Download CSV</Button><DataTable rows={rows.map((x, i) => ({ ...x, id: i }))} empty="No billed work in this period" cols={[{ h: 'Ref', cell: (x) => x.reference }, { h: 'Date', cell: (x) => dt(x.created_at) }, { h: 'Property', cell: (x) => x.property ?? '—' }, { h: 'Professional', cell: (x) => x.professional }, { h: 'Total', cell: (x) => kes(x.total) }, { h: 'Invoice', cell: (x) => x.invoice_no ?? '—' }]} /></>}</Async>
      <h3 style={{ marginTop: 24 }}>Maintenance history</h3><Async state={hist}>{(rows) => <DataTable rows={rows} empty="No history yet" cols={[{ h: 'Property', cell: (x) => x.property }, { h: 'Issue', cell: (x) => x.title }, { h: 'Status', cell: (x) => x.status }, { h: 'By', cell: (x) => x.professional ?? '—' }, { h: 'Done', cell: (x) => dt(x.completed_at) }]} />}</Async></>
  );
}
