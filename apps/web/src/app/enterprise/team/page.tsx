'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { useOrg } from '@/components/Org';
import { Async, Button, Card, PageTitle, Select, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function OrgTeam() {
  const org = useOrg(); const t = useToast(); const s = useAsync(() => (org ? api.orgMembers(org.id) : Promise.resolve([])), [org?.id]);
  const [f, setF] = useState({ phone: '', role: 'requester', limit: '' });
  if (!org) return null;
  return (
    <><PageTitle title="Team & permissions" sub="Requesters raise work, approvers sign off spend above their limit, viewers see reports." />
      <Card style={{ maxWidth: 520, marginBottom: 20 }}><h3>Invite a colleague</h3><TextField label="Phone (they need an account)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={['manager', 'approver', 'requester', 'viewer'].map((r) => ({ value: r, label: r }))} /><TextField label="Spend limit (KSh, optional)" inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
        <Button disabled={f.phone.length < 7} onClick={async () => { try { await api.inviteOrgMember(org.id, { phone: f.phone, role: f.role as any, spendLimit: f.limit ? Math.round(Number(f.limit) * 100) : undefined }); t.ok('Added'); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Add</Button></Card>
      <Async state={s}>{(rows) => <DataTable rows={rows.map((r) => ({ ...r, id: r.user_id }))} cols={[{ h: 'Name', cell: (r) => r.full_name }, { h: 'Role', cell: (r) => r.role }, { h: 'Spend limit', cell: (r) => (r.spend_limit ? kes(r.spend_limit) : '—') }, { h: '', cell: (r) => r.role !== 'owner' ? <Button small tone="danger" onClick={async () => { if (!confirm('Remove?')) return; await api.removeOrgMember(org.id, r.user_id); s.reload(); }}>Remove</Button> : null }]} />}</Async></>
  );
}
