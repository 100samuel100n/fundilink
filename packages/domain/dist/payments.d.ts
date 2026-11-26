/**
 * Pure rules for the two payment models.
 *
 *  Model 1 "escrow":  customer pays the platform in-app; the platform holds the money, deducts its commission and pays the professional out.
 *  Model 2 "direct":  customer pays the professional on site (cash or the professional's own M-Pesa); the platform's commission is
 *                     deducted from the professional's prepaid wallet, Uber/Bolt style. A professional with an empty wallet is not offered direct jobs.
 */
import { type LineItem } from './pricing.ts';
export type PaymentMode = 'escrow' | 'direct';
export type DirectMethod = 'cash' | 'mpesa';
export declare const PAYMENT_MODES: PaymentMode[];
export declare const walletAccount: (proId: string) => string;
/** Ledger account suffix helpers (kept next to the rules that use them). */
export declare const WALLET_TOPUP_KIND = "wallet_topup";
export interface WalletGate {
    ok: boolean;
    required: number;
    balance: number;
    shortfall: number;
    reason?: string;
}
/**
 * Can this professional take (or keep) a direct-pay job whose platform commission is `commission`?
 * The wallet must cover the commission AND stay at or above the platform minimum afterwards.
 */
export declare function walletGate(balance: number, commission: number, minBalance?: number): WalletGate;
/** Commission the platform earns from a direct job. There is no customer fee on direct jobs: the customer only pays the professional. */
export declare const directCommission: (serviceSubtotal: number, commissionBps: number) => number;
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
export declare function addonSplit(lines: LineItem[], commissionBps: number): AddonSplit;
/** Customer-facing guard rails for an add-on. */
export declare function validateAddon(lines: LineItem[], opts: {
    bookingSubtotal: number;
    maxMultiple?: number;
    minTotal?: number;
}): number;
export interface TopupLimits {
    min: number;
    max: number;
}
export declare function validateTopup(amount: number, l: TopupLimits): void;
/** Whether a booking in this mode ends in a payout to the professional or only a commission charge. */
export declare const settlesByPayout: (mode: PaymentMode) => mode is "escrow";
