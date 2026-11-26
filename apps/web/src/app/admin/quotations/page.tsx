'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';
export default function Quotations() {
  return <ListPage title="Quotations" load={() => api.adminX.quotations()} cols={() => [{ h: 'Project', cell: (q) => q.project }, { h: 'Professional', cell: (q) => q.professional }, { h: 'Total', cell: (q) => (q.total ? kes(q.total) : '—') }, { h: 'Status', cell: (q) => <Badge>{q.status}</Badge> }, { h: 'Submitted', cell: (q) => dt(q.created_at) }]} />;
}
