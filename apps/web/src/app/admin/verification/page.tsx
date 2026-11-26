'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Chip, Empty, PageTitle, TextField } from '@/components/ui';

export default function Verification() {
  const t = useToast();
  const [state, setState] = useState('pending');
  const q = useAsync(() => api.admin.verifications(state), [state]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const decide = async (id: string, decision: 'approved' | 'rejected' | 'suspended' | 'revoked') => {
    if (!(reason[id] ?? '').trim()) return t.err('A reason is required and is written to the audit log');
    try { await api.admin.decideVerification(id, { decision, reason: reason[id] }); t.ok(`Recorded: ${decision}`); q.reload(); } catch (e) { t.err(errMsg(e)); }
  };
  return (
    <><PageTitle title="Verification queue" sub="Identity, qualification and business are separate badges. Never approve a qualification you have not checked." />
      <div className="chips" style={{ marginBottom: 12 }}>{['pending', 'approved', 'rejected', 'expired', 'suspended', 'revoked'].map((s) => <Chip key={s} label={s} on={state === s} onClick={() => setState(s)} />)}</div>
      <Async state={q}>{(rows) => !rows.length ? <Empty title={`No ${state} verifications`} /> : (
        <div className="stack">{rows.map((v) => (
          <Card key={v.id}><div className="row between wrap-r"><div><strong>{v.display_name}</strong> <span className="muted small">· {v.county}</span></div><div className="row"><Badge tone="info">{v.level}</Badge><Badge>{v.state}</Badge></div></div>
            <p className="small muted" style={{ margin: '6px 0' }}>Categories: {(v.categories ?? []).join(', ') || '—'}</p>
            {(v.qualifications ?? []).length ? <ul className="small">{v.qualifications.map((x: any, i: number) => <li key={i}>{x.title} · {x.kind}{x.issuer ? ` · ${x.issuer}` : ''}{x.ref ? ` · #${x.ref}` : ''}</li>)}</ul> : null}
            {state === 'pending' ? <><TextField label="Decision reason (audited)" value={reason[v.id] ?? ''} onChange={(e) => setReason({ ...reason, [v.id]: e.target.value })} /><div className="row wrap-r"><Button small onClick={() => decide(v.id, 'approved')}>Approve</Button><Button small tone="danger" onClick={() => decide(v.id, 'rejected')}>Reject</Button><Button small tone="ghost" onClick={() => decide(v.id, 'suspended')}>Suspend</Button></div></> : null}
          </Card>))}</div>)}</Async></>
  );
}
