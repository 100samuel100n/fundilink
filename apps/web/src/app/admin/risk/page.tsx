'use client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Badge, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Risk() {
  const f = useAsync(() => api.admin.fraudFlags());
  return <><PageTitle title="Fraud & risk" sub="Automated scores only flag cases for human review. They never punish on their own." /><Async state={f}>{(rows) => <DataTable rows={rows} empty="No open flags" cols={[{ h: 'Signal', cell: (r) => r.signal }, { h: 'Score', cell: (r) => <Badge tone={Number(r.score) > 0.7 ? 'bad' : 'warn'}>{Number(r.score).toFixed(2)}</Badge> }, { h: 'Details', cell: (r) => <code className="small">{JSON.stringify(r.details)}</code> }, { h: 'Raised', cell: (r) => dt(r.created_at) }]} />}</Async></>;
}
