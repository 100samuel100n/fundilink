'use client';
import { use } from 'react';
import { BookingDetailView } from '@/components/BookingDetailView';
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <BookingDetailView id={id} side="professional" trackBase="/professional/track" />; }
