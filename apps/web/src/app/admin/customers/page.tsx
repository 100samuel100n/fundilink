'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Badge, Button, TextField } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';

export default function Customers() {
  const t = useToast(); const [q, setQ] = useState('');
  return <ListPage key={q} title="Customers" sub="Suspending an account revokes its sessions. Every change is audited with a reason." load={() => api.adminX.customers(q)}
    header={() => <div style={{ maxWidth: 360 }}><TextField label="Search name, phone or email (Enter)" defaultValue={q} onKeyDown={(e) => { if (e.key === 'Enter') setQ((e.target as HTMLInputElement).value); }} /></div>}
    cols={(reload) => [
      { h: 'Name', cell: (c) => c.full_name }, { h: 'Phone', cell: (c) => c.phone ?? '—' }, { h: 'Bookings', cell: (c) => c.bookings }, { h: 'Spent', cell: (c) => kes(c.spent) },
      { h: 'Joined', cell: (c) => dt(c.created_at) }, { h: 'Status', cell: (c) => <Badge tone={c.status === 'active' ? 'success' : 'danger'}>{c.status}</Badge> },
      { h: '', cell: (c) => <Button small tone="secondary" onClick={async () => {
        const reason = prompt(c.status === 'active' ? 'Reason for suspending?' : 'Reason for reinstating?'); if (!reason) return;
        try { await api.adminX.setCustomerStatus(c.id, { status: c.status === 'active' ? 'suspended' : 'active', reason }); t.ok('Updated'); reload(); } catch (e) { t.err(errMsg(e)); }
      }}>{c.status === 'active' ? 'Suspend' : 'Reinstate'}</Button> },
    ]} />;
}
