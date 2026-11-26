import { COUNTIES, PLACES } from './locations.ts';
/** Money is integer minor units (cents). */
export const toMajor = (minor: number | string | null | undefined) => Number(minor ?? 0) / 100;
export const kes = (minor: number | string | null | undefined, currency = 'KES') => {
  const v = toMajor(minor);
  const sym = currency === 'KES' ? 'KSh' : currency;
  return `${sym} ${v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: v % 1 ? 2 : 0 })}`;
};
export const toMinor = (major: number | string) => Math.round(Number(major) * 100);

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_payment: 'Pending payment', awaiting_acceptance: 'Awaiting acceptance', confirmed: 'Confirmed', declined: 'Declined',
  scheduled: 'Scheduled', en_route: 'En route', arrived: 'Arrived', in_progress: 'In progress', awaiting_completion: 'Awaiting your confirmation',
  completed: 'Completed', disputed: 'Disputed', cancelled: 'Cancelled', refunded: 'Refunded', partially_refunded: 'Partially refunded',
  settlement_pending: 'Settlement pending', settled: 'Settled',
};
export type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad';
export const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral', pending_payment: 'warn', awaiting_acceptance: 'warn', confirmed: 'info', declined: 'bad', scheduled: 'info', en_route: 'info',
  arrived: 'info', in_progress: 'info', awaiting_completion: 'warn', completed: 'good', disputed: 'bad', cancelled: 'bad', refunded: 'neutral',
  partially_refunded: 'neutral', settlement_pending: 'good', settled: 'good',
};

/** Buttons each side may show for a status (the API still validates; this only avoids offering impossible actions). */
export function nextActions(status: string, side: 'customer' | 'professional' | null): { to: string; label: string; needs?: 'gps' | 'pin' | 'reason'; tone?: 'primary' | 'danger' }[] {
  if (side === 'customer') {
    switch (status) {
      case 'awaiting_acceptance': case 'confirmed': case 'scheduled': return [{ to: 'cancelled', label: 'Cancel booking', needs: 'reason', tone: 'danger' }];
      case 'en_route': case 'arrived': return [{ to: 'cancelled', label: 'Cancel booking', needs: 'reason', tone: 'danger' }];
      case 'awaiting_completion': return [{ to: 'completed', label: 'Confirm work is complete', tone: 'primary' }, { to: 'disputed', label: 'Raise an issue', needs: 'reason', tone: 'danger' }];
      case 'in_progress': return [{ to: 'disputed', label: 'Raise an issue', needs: 'reason', tone: 'danger' }];
      case 'completed': return [{ to: 'disputed', label: 'Raise an issue', needs: 'reason', tone: 'danger' }];
      default: return [];
    }
  }
  if (side === 'professional') {
    switch (status) {
      case 'awaiting_acceptance': return [{ to: 'confirmed', label: 'Accept', tone: 'primary' }, { to: 'declined', label: 'Decline', needs: 'reason', tone: 'danger' }];
      case 'confirmed': case 'scheduled': return [{ to: 'en_route', label: 'Start journey', needs: 'gps', tone: 'primary' }, { to: 'cancelled', label: 'Cancel', needs: 'reason', tone: 'danger' }];
      case 'en_route': return [{ to: 'arrived', label: "I've arrived", needs: 'gps', tone: 'primary' }];
      case 'arrived': return [{ to: 'in_progress', label: 'Start job (customer PIN)', needs: 'pin', tone: 'primary' }];
      case 'in_progress': return [{ to: 'awaiting_completion', label: 'Mark work finished', tone: 'primary' }, { to: 'disputed', label: 'Raise an issue', needs: 'reason', tone: 'danger' }];
      case 'awaiting_completion': return [{ to: 'disputed', label: 'Raise an issue', needs: 'reason', tone: 'danger' }];
      default: return [];
    }
  }
  return [];
}

export const KENYA_CENTER = { lat: -1.2921, lng: 36.8219 };
export const COUNTIES_FEATURED = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Nyeri', 'Meru', 'Machakos'];
/** Every county HQ, plus every known town/estate by name (so 'Eldoret', 'Thika', 'Kilimani' also resolve). */
export const COUNTY_CENTERS: Record<string, { lat: number; lng: number }> = (() => {
  const o: Record<string, { lat: number; lng: number }> = {};
  for (const p of PLACES) o[p.name] = { lat: p.lat, lng: p.lng };
  for (const c of COUNTIES) o[c.name] = { lat: c.lat, lng: c.lng };
  return o;
})();
export const PRICING_LABEL: Record<string, string> = {
  fixed: 'Fixed price', hourly: 'Per hour', daily: 'Per day', call_out: 'Call-out fee', per_unit: 'Per unit', per_sqm: 'Per m²',
  project: 'Project', quotation: 'Quotation', recurring: 'Recurring',
};
export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-KE');
};

/** Kenyan mobile numbers: any common way of typing one -> 2547XXXXXXXX, or null. */
export function normalizeMsisdn(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = String(input).replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (/^254[71]\d{8}$/.test(d)) return d;
  if (/^0[71]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^[71]\d{8}$/.test(d)) return `254${d}`;
  return null;
}
/** 0712 345 678 style for display. */
export const prettyPhone = (s: string) => { const n = normalizeMsisdn(s); return n ? `0${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : s; };
