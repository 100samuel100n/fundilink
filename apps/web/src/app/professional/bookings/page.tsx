'use client';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Empty, PageTitle } from '@/components/ui';
import { BookingGrid } from '@/components/BookingList';
export default function Bookings() {
  const b = useAsync(() => api.bookings('professional'));
  return <><PageTitle title="Bookings" /><Async state={b}>{(l) => <BookingGrid list={l} base="/professional/bookings" empty={<Empty title="No bookings yet" />} />}</Async></>;
}
