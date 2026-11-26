import type { Metadata } from 'next';
import { Guard } from '@/components/Guard';
import { ProArea } from '@/components/ProArea';

export const metadata: Metadata = { title: { default: 'Professional dashboard', template: '%s | FundiLink Pro' }, robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Guard need="any"><ProArea>{children}</ProArea></Guard>;
}