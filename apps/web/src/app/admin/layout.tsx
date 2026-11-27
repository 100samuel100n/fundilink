import { Guard, Shell } from '@/components/Guard';
const G = (group: string, items: [string, string][]) => items.map(([href, label]) => ({ href, label, group }));
const LINKS = [
  ...G('Overview', [['/admin', 'Overview'], ['/admin/analytics', 'Analytics']]),
  ...G('People', [['/admin/customers', 'Customers'], ['/admin/professionals', 'Professionals'], ['/admin/businesses', 'Businesses'], ['/admin/verification', 'Verification']]),
  ...G('Marketplace', [['/admin/bookings', 'Bookings'], ['/admin/quotations', 'Quotations'], ['/admin/projects', 'Projects'], ['/admin/catalogue', 'Categories & services'], ['/admin/locations', 'Locations'], ['/admin/equipment', 'Equipment rental'], ['/admin/reviews', 'Reviews']]),
  ...G('Money', [['/admin/transactions', 'Transactions & ledger'], ['/admin/settlements', 'Settlements'], ['/admin/refunds', 'Refunds'], ['/admin/subscriptions', 'Subscriptions & activation'], ['/admin/promotions', 'Promotions'], ['/admin/settings', 'Commission & fees'], ['/admin/commission', 'Commission rules']]),
  ...G('Trust & support', [['/admin/disputes', 'Disputes'], ['/admin/support', 'Support desk'], ['/admin/reports', 'User reports'], ['/admin/risk', 'Fraud & risk'], ['/admin/audit-logs', 'Audit logs']]),
  ...G('Platform', [['/admin/notifications', 'Notification templates'], ['/admin/content', 'Content'], ['/admin/exports', 'Reports & exports'], ['/admin/roles', 'Roles & access']]),
];
export default function Layout({ children }: { children: React.ReactNode }) { return <Guard need="admin"><Shell links={LINKS} variant="admin">{children}</Shell></Guard>; }
