'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Async, Empty, PageTitle } from '@/components/ui';
import { BookingGrid } from '@/components/BookingList';

export default function Bookings() {
  const b = useAsync(() => api.bookings('customer'));
  return <><PageTitle title="My bookings" /><Async state={b}>{(l) => <BookingGrid list={l} base="/app/bookings" empty={<Empty title="No bookings yet" action={<Link className="btn" href="/explore">Find a professional</Link>} />} />}</Async></>;
}
