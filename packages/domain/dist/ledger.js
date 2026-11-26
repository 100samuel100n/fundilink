"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ledger = exports.proPayable = exports.PSP_FEES = exports.TAX = exports.REVENUE = exports.PSP = exports.LedgerError = void 0;
exports.paymentReceived = paymentReceived;
exports.processingFee = processingFee;
exports.payout = payout;
exports.refund = refund;
exports.reconcile = reconcile;
class LedgerError extends Error {
}
exports.LedgerError = LedgerError;
exports.PSP = 'PSP_HOLDING';
exports.REVENUE = 'PLATFORM_REVENUE';
exports.TAX = 'TAX_PAYABLE';
exports.PSP_FEES = 'PSP_FEES_EXPENSE';
const proPayable = (proId) => `PRO_PAYABLE:${proId}`;
exports.proPayable = proPayable;
class Ledger {
    txs = [];
    byKey = new Map();
    /** Idempotent: re-posting the same key returns the original transaction. */
    post(input) {
        const existing = this.byKey.get(input.idempotencyKey);
        if (existing)
            return existing;
        const entries = input.entries.filter((e) => e.debit !== 0 || e.credit !== 0);
        for (const e of entries) {
            if (!Number.isInteger(e.debit) || !Number.isInteger(e.credit) || e.debit < 0 || e.credit < 0) {
                throw new LedgerError('Entries must be non-negative integers');
            }
            if (e.debit > 0 && e.credit > 0)
                throw new LedgerError('An entry is either a debit or a credit');
        }
        const d = entries.reduce((s, e) => s + e.debit, 0);
        const c = entries.reduce((s, e) => s + e.credit, 0);
        if (entries.length < 2 || d !== c)
            throw new LedgerError(`Unbalanced transaction: debits ${d} != credits ${c}`);
        const tx = Object.freeze({
            id: `tx_${this.txs.length + 1}`,
            idempotencyKey: input.idempotencyKey,
            kind: input.kind,
            bookingId: input.bookingId,
            entries: Object.freeze(entries.map((e) => Object.freeze({ ...e }))),
            createdAt: new Date(),
        });
        this.txs.push(tx);
        this.byKey.set(tx.idempotencyKey, tx);
        return tx;
    }
    /** Debit-normal accounts (assets/expenses) report debit-credit; others credit-debit. */
    balance(account) {
        let d = 0, c = 0;
        for (const t of this.txs)
            for (const e of t.entries)
                if (e.account === account) {
                    d += e.debit;
                    c += e.credit;
                }
        const debitNormal = account === exports.PSP || account === exports.PSP_FEES;
        return debitNormal ? d - c : c - d;
    }
    isBalanced() {
        let d = 0, c = 0;
        for (const t of this.txs)
            for (const e of t.entries) {
                d += e.debit;
                c += e.credit;
            }
        return d === c;
    }
    all() { return this.txs; }
}
exports.Ledger = Ledger;
function paymentReceived(l, a) {
    const { gross, proNet, platformRevenue, tax } = a.split;
    if (proNet + platformRevenue + tax !== gross)
        throw new LedgerError('Split does not add up to gross');
    return l.post({
        idempotencyKey: `payment:${a.paymentId}`,
        kind: 'payment_received',
        bookingId: a.bookingId,
        entries: [
            { account: exports.PSP, debit: gross, credit: 0 },
            { account: (0, exports.proPayable)(a.proId), debit: 0, credit: proNet },
            { account: exports.REVENUE, debit: 0, credit: platformRevenue },
            { account: exports.TAX, debit: 0, credit: tax },
        ],
    });
}
function processingFee(l, a) {
    return l.post({
        idempotencyKey: `psp-fee:${a.paymentId}`,
        kind: 'psp_fee',
        bookingId: a.bookingId,
        entries: [
            { account: exports.PSP_FEES, debit: a.fee, credit: 0 },
            { account: exports.PSP, debit: 0, credit: a.fee },
        ],
    });
}
function payout(l, a) {
    if (l.balance((0, exports.proPayable)(a.proId)) < a.amount)
        throw new LedgerError('Payout exceeds professional balance');
    return l.post({
        idempotencyKey: `payout:${a.payoutId}`,
        kind: 'payout',
        bookingId: a.bookingId,
        entries: [
            { account: (0, exports.proPayable)(a.proId), debit: a.amount, credit: 0 },
            { account: exports.PSP, debit: 0, credit: a.amount },
        ],
    });
}
/** Refund `amount` to the customer, reversing the original split proportionally. */
function refund(l, a) {
    const { gross, platformRevenue, tax } = a.original;
    if (a.amount <= 0 || a.amount > gross)
        throw new LedgerError('Invalid refund amount');
    const revShare = Math.round((a.amount * platformRevenue) / gross);
    const taxShare = Math.round((a.amount * tax) / gross);
    const proShare = a.amount - revShare - taxShare;
    return l.post({
        idempotencyKey: `refund:${a.refundId}`,
        kind: 'refund',
        bookingId: a.bookingId,
        entries: [
            { account: (0, exports.proPayable)(a.proId), debit: proShare, credit: 0 },
            { account: exports.REVENUE, debit: revShare, credit: 0 },
            { account: exports.TAX, debit: taxShare, credit: 0 },
            { account: exports.PSP, debit: 0, credit: a.amount },
        ],
    });
}
/** Reconcile internal PSP balance against the provider's statement. */
function reconcile(l, providerBalance) {
    const internal = l.balance(exports.PSP);
    return { internal, provider: providerBalance, difference: providerBalance - internal, matches: internal === providerBalance };
}
