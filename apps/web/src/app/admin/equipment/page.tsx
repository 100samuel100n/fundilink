'use client';
import { kes } from '@fundilink/sdk';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui';
import { ListPage } from '@/components/ListPage';
export default function Equipment() {
  return <ListPage title="Equipment listings" sub="Rentals have their own contract, deposit and eligibility rules." load={() => api.adminX.equipment()}
    cols={() => [{ h: 'Item', cell: (e) => e.name }, { h: 'Owner', cell: (e) => e.owner }, { h: 'Category', cell: (e) => e.category }, { h: 'Daily', cell: (e) => kes(e.daily_rate) }, { h: 'Deposit', cell: (e) => kes(e.deposit) }, { h: 'Insurance', cell: (e) => (e.insurance_required ? 'Required' : '—') }, { h: 'Live', cell: (e) => <Badge tone={e.active ? 'success' : 'neutral'}>{e.active ? 'Yes' : 'No'}</Badge> }]} />;
}
