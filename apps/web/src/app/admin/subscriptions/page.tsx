'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, PageTitle, TextField } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Subs() {
  const t = useToast(); const s = useAsync(() => api.adminX.subscriptions()); const act = useAsync(() => api.adminX.activationPayments());
  const [edit, setEdit] = useState<Record<string, string>>({});
  return (
    <><PageTitle title="Subscriptions & activation fees" sub="Plans sell business tools, never ranking or access to jobs." />
      <Async state={s}>{(d) => (<div className="stack" style={{ gap: 20 }}>
        <div className="grid g3">{d.plans.map((p) => (
          <Card key={p.code}><h3>{p.name}</h3><p className="muted small">{p.code}</p>
            <TextField label="Monthly price (KSh)" inputMode="decimal" defaultValue={String(Number(p.monthly_amount) / 100)} onChange={(e) => setEdit({ ...edit, [p.code]: e.target.value })} />
            <Button small disabled={edit[p.code] === undefined} onClick={async () => { const reason = prompt('Reason for the price change?'); if (!reason) return; try { await api.adminX.setPlan(p.code, { monthlyAmount: Math.round(Number(edit[p.code]) * 100), reason }); t.ok('Saved'); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Save</Button></Card>))}</div>
        <Card><h3>Active subscriptions</h3><DataTable rows={d.active} empty="No paid subscriptions yet" cols={[{ h: 'Professional', cell: (x) => x.display_name }, { h: 'Plan', cell: (x) => x.plan }, { h: 'Status', cell: (x) => <Badge>{x.status}</Badge> }, { h: 'Renews', cell: (x) => dt(x.current_period_end) }]} /></Card></div>)}</Async>
      <Card style={{ marginTop: 20 }}><h3>Activation fee payments</h3><Async state={act}>{(rows) => <DataTable rows={rows} empty="No activation payments yet" cols={[{ h: 'Professional', cell: (x) => x.display_name }, { h: 'Amount', cell: (x) => (x.amount ? kes(x.amount) : 'Waived') }, { h: 'Paid', cell: (x) => dt(x.paid_at) }]} />}</Async></Card></>
  );
}
