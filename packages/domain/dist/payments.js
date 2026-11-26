"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlesByPayout = exports.directCommission = exports.WALLET_TOPUP_KIND = exports.walletAccount = exports.PAYMENT_MODES = void 0;
exports.walletGate = walletGate;
exports.addonSplit = addonSplit;
exports.validateAddon = validateAddon;
exports.validateTopup = validateTopup;
/**
 * Pure rules for the two payment models.
 *
 *  Model 1 "escrow":  customer pays the platform in-app; the platform holds the money, deducts its commission and pays the professional out.
 *  Model 2 "direct":  customer pays the professional on site (cash or the professional's own M-Pesa); the platform's commission is
 *                     deducted from the professional's prepaid wallet, Uber/Bolt style. A professional with an empty wallet is not offered direct jobs.
 */
const pricing_ts_1 = require("./pricing.js");
exports.PAYMENT_MODES = ['escrow', 'direct'];
const walletAccount = (proId) => `PRO_WALLET:${proId}`;
exports.walletAccount = walletAccount;
/** Ledger account suffix helpers (kept next to the rules that use them). */
exports.WALLET_TOPUP_KIND = 'wallet_topup';
/**
 * Can this professional take (or keep) a direct-pay job whose platform commission is `commission`?
 * The wallet must cover the commission AND stay at or above the platform minimum afterwards.
 */
function walletGate(balance, commission, minBalance = 0) {
    const required = commission + Math.max(0, minBalance);
    const shortfall = Math.max(0, required - balance);
    return shortfall === 0
        ? { ok: true, required, balance, shortfall: 0 }
        : { ok: false, required, balance, shortfall, reason: 'Wallet balance is too low to take pay-on-site jobs. Top up with M-Pesa.' };
}
/** Commission the platform earns from a direct job. There is no customer fee on direct jobs: the customer only pays the professional. */
const directCommission = (serviceSubtotal, commissionBps) => (0, pricing_ts_1.pct)(serviceSubtotal, commissionBps);
exports.directCommission = directCommission;
/** Split an approved add-on ("extra work") using the commission rate FROZEN on the booking, so rates changed later never alter a live job. */
function addonSplit(lines, commissionBps) {
    const inv = (0, pricing_ts_1.buildInvoice)(lines, { commissionBps, customerFeeBps: 0, taxBps: 0 });
    return { gross: inv.customerTotal, net: inv.professionalNet, commission: inv.commission, tax: inv.tax, revenue: inv.platformRevenue };
}
/** Customer-facing guard rails for an add-on. */
function validateAddon(lines, opts) {
    if (!lines.length)
        throw new Error('Add at least one extra item');
    const total = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitAmount), 0);
    const min = opts.minTotal ?? 1_000; // KSh 10
    if (total < min)
        throw new Error('The extra amount is too small');
    const cap = Math.max(opts.bookingSubtotal, 500_000) * (opts.maxMultiple ?? 3); // never more than 3x the booking (or KSh 15,000) without a new quotation
    if (total > cap)
        throw new Error('This is a large change. Please agree a new quotation with the customer instead.');
    return total;
}
function validateTopup(amount, l) {
    if (!Number.isInteger(amount))
        throw new Error('Amount must be a whole number of cents');
    if (amount % 100 !== 0)
        throw new Error('Top-ups are in whole shillings');
    if (amount < l.min)
        throw new Error('Amount is below the minimum top-up');
    if (amount > l.max)
        throw new Error('Amount is above the maximum top-up');
}
/** Whether a booking in this mode ends in a payout to the professional or only a commission charge. */
const settlesByPayout = (mode) => mode === 'escrow';
exports.settlesByPayout = settlesByPayout;
