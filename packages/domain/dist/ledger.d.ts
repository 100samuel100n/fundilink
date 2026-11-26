/**
 * Immutable double-entry ledger. Balances are DERIVED from entries, never edited.
 * Corrections are made by posting reversing transactions.
 *
 * Chart of accounts
 *   PSP_HOLDING                 asset      funds held by the licensed payment partner
 *   PRO_PAYABLE:<id>            liability  owed to a professional
 *   PLATFORM_REVENUE            revenue    commission + customer fees
 *   TAX_PAYABLE                 liability  tax collected on platform fees
 *   PSP_FEES_EXPENSE            expense    payment processing costs
 */
export interface Entry {
    account: string;
    debit: number;
    credit: number;
}
export interface LedgerTx {
    id: string;
    idempotencyKey: string;
    kind: string;
    bookingId?: string;
    entries: Entry[];
    createdAt: Date;
}
export declare class LedgerError extends Error {
}
export declare const PSP = "PSP_HOLDING";
export declare const REVENUE = "PLATFORM_REVENUE";
export declare const TAX = "TAX_PAYABLE";
export declare const PSP_FEES = "PSP_FEES_EXPENSE";
export declare const proPayable: (proId: string) => string;
export declare class Ledger {
    private txs;
    private byKey;
    /** Idempotent: re-posting the same key returns the original transaction. */
    post(input: {
        idempotencyKey: string;
        kind: string;
        bookingId?: string;
        entries: Entry[];
    }): LedgerTx;
    /** Debit-normal accounts (assets/expenses) report debit-credit; others credit-debit. */
    balance(account: string): number;
    isBalanced(): boolean;
    all(): readonly LedgerTx[];
}
export interface PaymentSplit {
    gross: number;
    proNet: number;
    platformRevenue: number;
    tax: number;
}
export declare function paymentReceived(l: Ledger, a: {
    paymentId: string;
    bookingId: string;
    proId: string;
    split: PaymentSplit;
}): LedgerTx;
export declare function processingFee(l: Ledger, a: {
    paymentId: string;
    bookingId: string;
    fee: number;
}): LedgerTx;
export declare function payout(l: Ledger, a: {
    payoutId: string;
    proId: string;
    amount: number;
    bookingId?: string;
}): LedgerTx;
/** Refund `amount` to the customer, reversing the original split proportionally. */
export declare function refund(l: Ledger, a: {
    refundId: string;
    bookingId: string;
    proId: string;
    amount: number;
    original: PaymentSplit;
}): LedgerTx;
/** Reconcile internal PSP balance against the provider's statement. */
export declare function reconcile(l: Ledger, providerBalance: number): {
    internal: number;
    provider: number;
    difference: number;
    matches: boolean;
};
