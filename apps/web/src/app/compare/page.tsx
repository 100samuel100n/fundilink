import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CompareClient } from '@/components/CompareClient';
import { Skeleton } from '@/components/ui';
export const metadata: Metadata = { title: 'Compare professionals' };
export default function ComparePage() { return <main id="main" className="wrap section"><h1 style={{ fontSize: '2rem' }}>Compare professionals</h1><Suspense fallback={<Skeleton h={200} />}><CompareClient /></Suspense></main>; }
