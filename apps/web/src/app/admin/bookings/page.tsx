'use client';
import { useState } from 'react';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { Select, StatusBadge } from '@/components/ui';
import { dt } from '@/components/DataTable';
import { ListPage } from '@/components/ListPage';

const STATUSES = ['', 'pending_payment', 'awaiting_acceptance', 'scheduled', 'en_route', 'arrived', 'in_progress', 'awaiting_completion', 'completed', 'disputed', 'cancelled', 'settlement_pending', 'settled'];
export default function Bookings() {
  const [status, setStatus] = useState('');
  return <ListPage key={status} title="Bookings" sub="Read-only view. Status changes only happen through the booking state machine." load={() => api.adminX.bookings({ status: status || undefined })}
    header={() => <div style={{ maxWidth: 260 }}><Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES.map((s) => ({ value: s, label: s ? s.replace(/_/g, ' ') : 'All' }))} /></div>}
    cols={() => [{ h: 'Ref', cell: (b) => b.reference }, { h: 'Type', cell: (b) => b.kind }, { h: 'Customer', cell: (b) => b.customer }, { h: 'Professional', cell: (b) => b.professional }, { h: 'Total', cell: (b) => kes(b.total) }, { h: 'Status', cell: (b) => <StatusBadge status={b.status} /> }, { h: 'Created', cell: (b) => dt(b.created_at) }]} />;
}
