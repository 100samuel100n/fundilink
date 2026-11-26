/**
 * Pure rules for the two payment models.
 *
 *  Model 1 "escrow":  customer pays the platform in-app; the platform holds the money, deducts its commission and pays the professional out.
 *  Model 2 "direct":  customer pays the professional on site (cash or the professional's own M-Pesa); the platform's commission is
 *                     deducted from the professional's prepaid wallet, Uber/Bolt style. A professional with an empty wallet is not offered direct jobs.
 */
import { buildInvoice, pct, type LineItem } from './pricing.ts';

export type PaymentMode = 'escrow' | 'direct';
export type DirectMethod = 'cash' | 'mpesa';
export const PAYMENT_MODES: PaymentMode[] = ['escrow', 'direct'];

export const walletAccount = (proId: string) => `PRO_WALLET:${proId}`;

/** Ledger account suffix helpers (kept next to the rules that use them). */
export const WALLET_TOPUP_KIND = 'wallet_topup';

export interface WalletGate { ok: boolean; required: number; balance: number; shortfall: number; reason?: string }

/**
 * Can this professional take (or keep) a direct-pay job whose platform commission is `commission`?
 * The wallet must cover the commission AND stay at or above the platform minimum afterwards.
 */
export function walletGate(balance: number, commission: number, minBalance = 0): WalletGate {
  const required = commission + Math.max(0, minBalance);
  const shortfall = Math.max(0, required - balance);
  return shortfall === 0
    ? { ok: true, required, balance, shortfall: 0 }
    : { ok: false, required, balance, shortfall, reason: 'Wallet balance is too low to take pay-on-site jobs. Top up with M-Pesa.' };
}

/** Commission the platform earns from a direct job. There is no customer fee on direct jobs: the customer only pays the professional. */
export const directCommission = (serviceSubtotal: number, commissionBps: number) => pct(serviceSubtotal, commissionBps);

export interface AddonSplit {
  /** what the customer pays for the extra work */
  gross: number;
  /** extra amount owed to the professional */
  net: number;
  commission: number;
  tax: number;
  revenue: number;
}

/** Split an approved add-on ("extra work") using the commission rate FROZEN on the booking, so rates changed later never alter a live job. */
export function addonSplit(lines: LineItem[], commissionBps: number): AddonSplit {
  const inv = buildInvoice(lines, { commissionBps, customerFeeBps: 0, taxBps: 0 });
  return { gross: inv.customerTotal, net: inv.professionalNet, commission: inv.commission, tax: inv.tax, revenue: inv.platformRevenue };
}

/** Customer-facing guard rails for an add-on. */
export function validateAddon(lines: LineItem[], opts: { bookingSubtotal: number; maxMultiple?: number; minTotal?: number } ) {
  if (!lines.length) throw new Error('Add at least one extra item');
  const total = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitAmount), 0);
  const min = opts.minTotal ?? 1_000; // KSh 10
  if (total < min) throw new Error('The extra amount is too small');
  const cap = Math.max(opts.bookingSubtotal, 500_000) * (opts.maxMultiple ?? 3); // never more than 3x the booking (or KSh 15,000) without a new quotation
  if (total > cap) throw new Error('This is a large change. Please agree a new quotation with the customer instead.');
  return total;
}

export interface TopupLimits { min: number; max: number }
export function validateTopup(amount: number, l: TopupLimits) {
  if (!Number.isInteger(amount)) throw new Error('Amount must be a whole number of cents');
  if (amount % 100 !== 0) throw new Error('Top-ups are in whole shillings');
  if (amount < l.min) throw new Error('Amount is below the minimum top-up');
  if (amount > l.max) throw new Error('Amount is above the maximum top-up');
}

/** Whether a booking in this mode ends in a payout to the professional or only a commission charge. */
export const settlesByPayout = (mode: PaymentMode) => mode === 'escrow';
