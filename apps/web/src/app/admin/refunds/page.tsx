'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { errMsg, useAsync } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { Async, Badge, Button, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';

export default function Refunds() {
  const t = useToast();
  const r = useAsync(() => api.admin.refunds());
  return (
    <><PageTitle title="Refunds" sub="Large refunds need a higher permission; the server decides." />
      <Async state={r}>{(rows) => <DataTable rows={rows} empty="No refund requests" cols={[{ h: 'Booking', cell: (x) => x.reference }, { h: 'Amount', cell: (x) => kes(x.amount) }, { h: 'Reason', cell: (x) => x.reason }, { h: 'Status', cell: (x) => <Badge tone={x.status === 'processed' ? 'good' : x.status === 'requested' ? 'warn' : 'neutral'}>{x.status}</Badge> }, { h: 'Requested', cell: (x) => dt(x.created_at) },
        { h: '', cell: (x) => x.status === 'requested' ? <Button small onClick={async () => { if (!confirm(`Approve refund of ${kes(x.amount)}?`)) return; try { await api.admin.approveRefund(x.id); t.ok('Refund approved'); r.reload(); } catch (e) { t.err(errMsg(e)); } }}>Approve</Button> : null }]} />}</Async></>
  );
}
