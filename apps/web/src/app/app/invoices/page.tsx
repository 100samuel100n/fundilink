'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, PageTitle } from '@/components/ui';
import { DataTable, dt } from '@/components/DataTable';
export default function Invoices() {
  const s = useAsync(() => api.myInvoices());
  return <><PageTitle title="Invoices & receipts" /><Async state={s}>{(rows) => <DataTable rows={rows} empty="No invoices yet" cols={[{ h: 'No.', cell: (r) => r.number }, { h: 'Booking', cell: (r) => r.reference }, { h: 'Issued', cell: (r) => dt(r.issued_at) }, { h: 'Total', cell: (r) => kes(r.total) }]} />}</Async></>;
}
