export const ADMIN_ROLES = ['super_admin', 'platform_admin', 'operations_manager', 'verification_officer', 'finance_officer', 'support_agent', 'dispute_officer', 'content_manager', 'marketing_manager', 'analyst'];
export const isStaff = (roles: string[]) => roles.some((r) => ADMIN_ROLES.includes(r));

/** The single place that decides where a signed-in person belongs. */
export function homeFor(roles: string[]): string {
  if (isStaff(roles)) return '/admin';
  if (roles.includes('customer')) return '/app';
  if (roles.some((r) => r === 'professional' || r === 'business_member')) return '/professional';
  if (roles.includes('org_member')) return '/enterprise';
  return '/app';
}

/** Only same-site paths; blocks //evil.com style open redirects. */
export function safeNext(n: string | null): string | null {
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : null;
}