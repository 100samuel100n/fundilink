'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, Card, Check, PageTitle, Select, TextField } from '@/components/ui';
import { DataTable } from '@/components/DataTable';

export default function Roles() {
  const t = useToast(); const r = useAsync(() => api.adminX.roles()); const staff = useAsync(() => api.adminX.staff());
  const [sel, setSel] = useState<string>(''); const [perms, setPerms] = useState<string[]>([]);
  const [g, setG] = useState({ identifier: '', role: 'support_agent' });
  const FIXED = ['super_admin', 'customer', 'professional', 'business_member', 'org_member'];
  return (
    <><PageTitle title="Roles & access control" sub="No admin gets unrestricted access. Financial permissions are separate. Changes are audited with a reason." />
      <Async state={r}>{(d) => (
        <div className="grid g2">
          <Card><h3>Edit a role</h3>
            <Select label="Role" value={sel} onChange={(e) => { setSel(e.target.value); setPerms(d.roles.find((x) => x.code === e.target.value)?.permissions ?? []); }} options={[{ value: '', label: 'Choose…' }, ...d.roles.filter((x) => !FIXED.includes(x.code)).map((x) => ({ value: x.code, label: x.code }))]} />
            {sel && <div style={{ maxHeight: 300, overflow: 'auto' }}>{d.permissions.map((p) => <Check key={p.code} label={p.code} checked={perms.includes(p.code)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.code] : perms.filter((x) => x !== p.code))} />)}</div>}
            <Button disabled={!sel} onClick={async () => { const reason = prompt('Reason for changing this role?'); if (!reason) return; try { await api.adminX.setRolePermissions(sel, { permissions: perms, reason }); t.ok('Role updated'); r.reload(); } catch (e) { t.err(errMsg(e)); } }}>Save role</Button></Card>
          <Card><h3>Grant or revoke staff role</h3>
            <TextField label="Staff phone or email" value={g.identifier} onChange={(e) => setG({ ...g, identifier: e.target.value })} />
            <Select label="Role" value={g.role} onChange={(e) => setG({ ...g, role: e.target.value })} options={d.roles.filter((x) => !['customer', 'professional', 'business_member', 'org_member'].includes(x.code)).map((x) => ({ value: x.code, label: x.code }))} />
            <div className="row"><Button disabled={!g.identifier} onClick={async () => { const reason = prompt('Reason?'); if (!reason) return; try { await api.adminX.grantRole({ ...g, reason }); t.ok('Granted'); staff.reload(); } catch (e) { t.err(errMsg(e)); } }}>Grant</Button>
              <Button tone="danger" disabled={!g.identifier} onClick={async () => { const reason = prompt('Reason?'); if (!reason) return; try { await api.adminX.grantRole({ ...g, revoke: true, reason }); t.ok('Revoked'); staff.reload(); } catch (e) { t.err(errMsg(e)); } }}>Revoke</Button></div></Card>
        </div>)}</Async>
      <Card style={{ marginTop: 20 }}><h3>Staff</h3><Async state={staff}>{(rows) => <DataTable rows={rows} cols={[{ h: 'Name', cell: (x) => x.full_name }, { h: 'Contact', cell: (x) => x.email ?? x.phone }, { h: 'Roles', cell: (x) => (x.roles as string[]).map((c) => <Badge key={c}>{c}</Badge>) }]} />}</Async></Card></>
  );
}
