import type { Metadata } from 'next';
import { EmergencyFlow } from '@/components/EmergencyFlow';
export const metadata: Metadata = { title: 'Urgent help', description: 'Find professionals who are available now and take urgent jobs.' };
export default function Page() { return <main id="main" className="wrap narrow section"><EmergencyFlow /></main>; }
