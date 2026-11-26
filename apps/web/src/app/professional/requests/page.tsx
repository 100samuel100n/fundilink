'use client';
import { api } from '@/lib/api';
import { useAsync, usePoll } from '@/lib/hooks';
import { Async, Empty, PageTitle } from '@/components/ui';
import { BookingGrid } from '@/components/BookingList';
export default function Requests() {
  const b = useAsync(() => api.bookings('professional'));
  usePoll(() => b.refresh(), 20000);
  return <><PageTitle title="Requests" sub="Respond before the request expires." /><Async state={b}>{(l) => <BookingGrid list={l.filter((x) => x.status === 'awaiting_acceptance')} base="/professional/bookings" empty={<Empty title="No pending requests" />} />}</Async></>;
}
