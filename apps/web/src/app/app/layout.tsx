import { Guard, Shell } from '@/components/Guard';
const LINKS = [
  { href: '/app', label: 'Home', icon: 'home' as const }, { href: '/app/bookings', label: 'Bookings', icon: 'calendar' as const }, { href: '/app/quotations', label: 'Quotations', icon: 'fileCheck' as const },
  { href: '/app/messages', label: 'Messages', icon: 'message' as const }, { href: '/app/recurring', label: 'Recurring services' }, { href: '/app/saved', label: 'Saved professionals' }, { href: '/app/locations', label: 'Saved locations' }, { href: '/app/properties', label: 'Property history' },
  { href: '/app/payments', label: 'Payments & refunds' }, { href: '/app/invoices', label: 'Invoices' }, { href: '/app/reviews', label: 'Reviews' }, { href: '/app/warranty', label: 'Warranty claims' },
  { href: '/app/equipment', label: 'Hire equipment' }, { href: '/app/loyalty', label: 'Rewards & referrals' }, { href: '/app/notifications', label: 'Notifications' },
  { href: '/app/support', label: 'Help assistant' }, { href: '/app/tickets', label: 'Support tickets' }, { href: '/app/settings', label: 'Settings' },
];
export default function Layout({ children }: { children: React.ReactNode }) { return <Guard need="customer"><Shell links={LINKS}>{children}</Shell></Guard>; }
