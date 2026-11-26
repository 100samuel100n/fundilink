'use client';
import { usePathname } from 'next/navigation';
import { Guard, Shell } from '@/components/Guard';
import { useAuth } from '@/lib/auth';
const LINKS = [
  { href: '/professional', label: 'Home', icon: 'home' as const }, { href: '/professional/requests', label: 'Requests', icon: 'bell' as const }, { href: '/professional/bookings', label: 'Jobs', icon: 'calendar' as const },
  { href: '/professional/quotations', label: 'Quotations' }, { href: '/professional/services', label: 'Services & prices' }, { href: '/professional/availability', label: 'Availability' },
  { href: '/professional/portfolio', label: 'Portfolio' }, { href: '/professional/customers', label: 'Customers' }, { href: '/professional/messages', label: 'Messages', icon: 'message' as const },
  { href: '/professional/earnings', label: 'Earnings & payouts' }, { href: '/professional/wallet', label: 'Wallet' }, { href: '/professional/analytics', label: 'Analytics' }, { href: '/professional/reviews', label: 'Reviews' },
  { href: '/professional/warranty', label: 'Warranty claims' }, { href: '/professional/verification', label: 'Verification' }, { href: '/professional/team', label: 'Team' },
  { href: '/professional/equipment', label: 'Equipment for hire' }, { href: '/professional/marketing', label: 'Grow & invoices' }, { href: '/professional/plan', label: 'Plan & activation' }, { href: '/professional/settings', label: 'Settings' },
];
export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const { isPro } = useAuth();
  // onboarding is open to any signed-in user; the rest needs the professional role
  if (path.startsWith('/professional/onboarding')) return <Guard need="any"><div className="wrap section">{children}</div></Guard>;
  return <Guard need="pro"><Shell links={LINKS}>{children}</Shell></Guard>;
}
