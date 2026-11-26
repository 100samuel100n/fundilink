'use client';
import React from 'react';
import Link from 'next/link';
import type { Booking } from '@fundilink/sdk';
import { Card, Money, StatusBadge } from './ui';

export const ACTIVE = ['awaiting_acceptance', 'confirmed', 'scheduled', 'en_route', 'arrived', 'in_progress', 'awaiting_completion', 'pending_payment'];
const startOf = (r: string) => { const m = /["\[(]([^,"\])]+)/.exec(r ?? ''); return m ? new Date(m[1].replace(/\\"/g, '')) : null; };

export function BookingRow({ b, base }: { b: Booking; base: string }) {
  const d = startOf(b.scheduled_during);
  return (
    <Link href={`${base}/${b.id}`} className="card" style={{ display: 'block' }}>
      <div className="row between wrap-r"><strong>{b.reference}</strong><StatusBadge status={b.status} /></div>
      <p style={{ margin: '4px 0' }}>{b.description?.slice(0, 120)}</p>
      <div className="row between small muted"><span>{d && !isNaN(+d) ? d.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span><Money minor={b.total} bold /></div>
    </Link>
  );
}
export const BookingGrid = ({ list, base, empty }: { list: Booking[]; base: string; empty: React.ReactNode }) => list.length ? <div className="stack">{list.map((b) => <BookingRow key={b.id} b={b} base={base} />)}</div> : <>{empty}</>;
export { Card };
