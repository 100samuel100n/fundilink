/**
 * Money is ALWAYS integer minor units (KES cents). Never floats.
 * Fees are expressed in basis points (500 bps = 5%).
 */
export type PricingModel =
  | 'fixed'
  | 'hourly'
  | 'daily'
  | 'call_out'
  | 'per_unit'
  | 'per_sqm'
  | 'project'
  | 'quotation'
  | 'recurring';

export interface Money {
  amount: number; // minor units
  currency: string;
}

export const pct = (amount: number, bps: number) => Math.round((amount * bps) / 10_000);

export interface LineItem {
  label: string;
  kind: 'labour' | 'materials' | 'transport' | 'other';
  quantity: number;
  unitAmount: number; // minor units
}

export interface FeeRules {
  /** deducted from the professional's earnings */
  commissionBps: number;
  /** optional fee added on top for the customer */
  customerFeeBps: number;
  /** tax on the customer-facing service fee, if applicable */
  taxBps: number;
}

export const DEFAULT_FEES: FeeRules = { commissionBps: 500, customerFeeBps: 0, taxBps: 0 };

export interface Invoice {
  lines: (LineItem & { total: number })[];
  serviceSubtotal: number;
  customerFee: number;
  tax: number;
  customerTotal: number;
  commission: number;
  professionalNet: number;
  platformRevenue: number;
}

export function buildInvoice(lines: LineItem[], rules: FeeRules = DEFAULT_FEES): Invoice {
  if (lines.length === 0) throw new Error('Invoice needs at least one line');
  const priced = lines.map((l) => {
    if (!Number.isInteger(l.unitAmount) || l.unitAmount < 0) throw new Error('unitAmount must be a non-negative integer');
    if (l.quantity <= 0) throw new Error('quantity must be positive');
    return { ...l, total: Math.round(l.quantity * l.unitAmount) };
  });
  const serviceSubtotal = priced.reduce((s, l) => s + l.total, 0);
  const customerFee = pct(serviceSubtotal, rules.customerFeeBps);
  const tax = pct(customerFee, rules.taxBps);
  const customerTotal = serviceSubtotal + customerFee + tax;
  const commission = pct(serviceSubtotal, rules.commissionBps);
  const professionalNet = serviceSubtotal - commission;
  return {
    lines: priced,
    serviceSubtotal,
    customerFee,
    tax,
    customerTotal,
    commission,
    professionalNet,
    platformRevenue: commission + customerFee, // tax is a pass-through liability, not revenue
  };
}

/* ---------- Travel / call-out fees ---------- */
export interface TravelPolicy {
  freeRadiusKm: number;
  perKmAmount: number; // minor units per km beyond free radius
  minCallOut: number;
  maxTravelKm: number;
  outOfAreaSurcharge: number; // flat, when beyond maxTravelKm but pro opts in
  allowOutOfArea: boolean;
}

export type TravelQuote =
  | { ok: true; fee: number; km: number }
  | { ok: false; reason: 'out_of_service_area' };

export function travelFee(distanceKm: number, p: TravelPolicy): TravelQuote {
  if (distanceKm > p.maxTravelKm) {
    if (!p.allowOutOfArea) return { ok: false, reason: 'out_of_service_area' };
    const extra = Math.ceil(distanceKm - p.freeRadiusKm) * p.perKmAmount;
    return { ok: true, km: distanceKm, fee: Math.max(p.minCallOut, extra + p.outOfAreaSurcharge) };
  }
  if (distanceKm <= p.freeRadiusKm) return { ok: true, km: distanceKm, fee: 0 };
  const billable = Math.ceil(distanceKm - p.freeRadiusKm);
  return { ok: true, km: distanceKm, fee: billable * p.perKmAmount };
}

/* ---------- Price revisions: never silently raise an agreed price ---------- */
export interface Revision {
  originalTotal: number;
  revisedTotal: number;
  customerApproved: boolean;
  reason: string;
}

export function assertRevisionAllowed(r: Revision) {
  if (!r.reason.trim()) throw new Error('A revision must explain why the price changed');
  if (r.revisedTotal > r.originalTotal && !r.customerApproved) {
    throw new Error('Price increase requires explicit customer approval before extra work starts');
  }
}

/* ---------- Milestones ---------- */
export interface Milestone {
  title: string;
  percentBps: number;
  criteria: string;
}

export function validateMilestones(ms: Milestone[]) {
  if (ms.length === 0) throw new Error('At least one milestone is required');
  const total = ms.reduce((s, m) => s + m.percentBps, 0);
  if (total !== 10_000) throw new Error(`Milestones must total 100% (got ${total / 100}%)`);
  for (const m of ms) if (!m.criteria.trim()) throw new Error(`Milestone "${m.title}" needs completion criteria`);
}

/** Split a project total across milestones; the last milestone absorbs rounding drift. */
export function milestoneAmounts(total: number, ms: Milestone[]): number[] {
  validateMilestones(ms);
  const out = ms.map((m) => pct(total, m.percentBps));
  const drift = total - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += drift;
  return out;
}
