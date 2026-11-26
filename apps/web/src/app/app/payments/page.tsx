'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Empty, Money, PageTitle, StatusBadge } from '@/components/ui';

export default function Payments() {
  const b = useAsync(() => api.bookings('customer'));
  return (
    <><PageTitle title="Payments & refunds" sub="Receipts for every paid booking. Request a refund from the booking page." />
      <Async state={b}>{(l) => {
        const paid = l.filter((x) => !['draft', 'pending_payment', 'awaiting_acceptance', 'declined'].includes(x.status) || x.status === 'refunded');
        return !paid.length ? <Empty title="No payments yet" /> : <div className="tablewrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Paid</th><th>Status</th><th>Total</th></tr></thead><tbody>{paid.map((x) => <tr key={x.id}><td>{new Date(x.created_at).toLocaleDateString('en-KE')}</td><td><Link href={`/app/bookings/${x.id}`}>{x.reference}</Link></td><td>{x.payment_mode === 'direct' ? 'On site' : 'In app'}</td><td><StatusBadge status={x.status} /></td><td><Money minor={x.total} /></td></tr>)}</tbody></table></div>;
      }}</Async></>
  );
}
