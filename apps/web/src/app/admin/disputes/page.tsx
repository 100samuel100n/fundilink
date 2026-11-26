'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { kes } from '@fundilink/sdk';
import { Async, Badge, Button, Card, Empty, PageTitle, Select, TextArea, TextField } from '@/components/ui';
import { dt } from '@/components/DataTable';

export default function Disputes() {
  const t = useToast();
  const d = useAsync(() => api.admin.disputes());
  const [f, setF] = useState<Record<string, { outcome: string; resolution: string; refund: string }>>({});
  const get = (id: string) => f[id] ?? { outcome: 'resolved_split', resolution: '', refund: '' };
  return (
    <><PageTitle title="Disputes" sub="Every dispute has a resolution deadline so funds are never locked indefinitely." />
      <Async state={d}>{(rows) => !rows.length ? <Empty title="No disputes" /> : (
        <div className="stack">{rows.map((x) => { const v = get(x.id); const open = !String(x.status).startsWith('resolved'); const late = open && new Date(x.resolution_due_at) < new Date();
          return (
            <Card key={x.id}><div className="row between wrap-r"><strong>{x.reference ?? 'Milestone dispute'}</strong><div className="row"><Badge tone={late ? 'bad' : open ? 'warn' : 'good'}>{x.status}</Badge><span className="muted small">due {dt(x.resolution_due_at)}</span></div></div>
              <p>{x.reason}</p>{x.resolution ? <p className="small muted">Resolution: {x.resolution}{x.refund_amount ? ` · refund ${kes(x.refund_amount)}` : ''}</p> : null}
              {open ? <>
                <Select label="Outcome" value={v.outcome} onChange={(e) => setF({ ...f, [x.id]: { ...v, outcome: e.target.value } })} options={[{ value: 'resolved_customer', label: 'In favour of customer' }, { value: 'resolved_professional', label: 'In favour of professional' }, { value: 'resolved_split', label: 'Split / partial refund' }]} />
                {v.outcome !== 'resolved_professional' ? <TextField label="Refund amount (KSh)" inputMode="decimal" value={v.refund} onChange={(e) => setF({ ...f, [x.id]: { ...v, refund: e.target.value } })} /> : null}
                <TextArea label="Resolution notes (audited)" value={v.resolution} onChange={(e) => setF({ ...f, [x.id]: { ...v, resolution: e.target.value } })} />
                <Button disabled={v.resolution.trim().length < 5} onClick={async () => { try { await api.admin.resolveDispute(x.id, { outcome: v.outcome as any, resolution: v.resolution, refundAmount: v.refund ? Math.round(Number(v.refund) * 100) : undefined }); t.ok('Dispute resolved'); d.reload(); } catch (e) { t.err(errMsg(e)); } }}>Resolve</Button></> : null}
            </Card>); })}</div>)}</Async></>
  );
}
