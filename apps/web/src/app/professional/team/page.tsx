'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Button, Card, PageTitle, Select, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Team() {
  const t = useToast(); const s = useAsync(() => api.team());
  const [f, setF] = useState({ phone: '', role: 'technician' });
  return (
    <><PageTitle title="Team" sub="Business accounts: administrators, operations, support and technicians, with per-technician performance." />
      <Card style={{ maxWidth: 520, marginBottom: 20 }}><h3>Add a team member</h3>
        <TextField label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /><Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={['technician', 'operations', 'support', 'admin'].map((r) => ({ value: r, label: r }))} />
        <Button disabled={f.phone.length < 7} onClick={async () => { try { const r: any = await api.addTeamMember({ phone: f.phone, role: f.role as any }); t.ok(r.invited ? 'Invitation sent by SMS' : 'Added'); setF({ ...f, phone: '' }); s.reload(); } catch (e) { t.err(errMsg(e)); } }}>Add</Button></Card>
      <Async state={s}>{(rows) => <DataTable rows={rows.map((r) => ({ ...r, id: r.user_id }))} empty="Business accounts only" cols={[{ h: 'Name', cell: (r) => r.full_name }, { h: 'Role', cell: (r) => r.role }, { h: 'Jobs done', cell: (r) => r.completed }, { h: 'Rating', cell: (r) => r.rating ?? '—' },
        { h: '', cell: (r) => <Button small tone="danger" onClick={async () => { if (!confirm('Remove this member?')) return; await api.removeTeamMember(r.user_id); s.reload(); }}>Remove</Button> }]} />}</Async></>
  );
}
