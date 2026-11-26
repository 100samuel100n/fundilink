'use client';
import { use } from 'react';
import { TrackView } from '@/components/TrackView';
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <TrackView id={id} side="professional" back={`/professional/bookings/${id}`} />; }
