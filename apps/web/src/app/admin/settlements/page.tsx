'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Badge, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Settlements() {
  const s = useAsync(() => api.admin.settlements());
  return <><PageTitle title="Settlements" sub="Professional payouts." /><Async state={s}>{(rows) => <DataTable rows={rows} empty="No settlements yet" cols={[{ h: 'Professional', cell: (r) => r.display_name }, { h: 'Amount', cell: (r) => kes(r.amount) }, { h: 'Status', cell: (r) => <Badge tone={r.status === 'paid' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status}</Badge> }, { h: 'Provider ref', cell: (r) => r.provider_ref ?? '—' }, { h: 'Created', cell: (r) => dt(r.created_at) }]} />}</Async></>;
}
