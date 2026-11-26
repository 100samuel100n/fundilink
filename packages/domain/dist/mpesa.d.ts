/**
 * Pure M-Pesa (Safaricom Daraja) helpers. No network, no Node-only APIs, so they are shared by the API,
 * the web app and the mobile app and are covered by unit tests.
 *
 * Money in FundiLink is integer minor units (KES cents). M-Pesa moves whole shillings only, so every
 * amount sent to Daraja goes through `toShillings` (rounded UP, never down: the customer is never undercharged).
 */
/** Normalise any common Kenyan way of writing a mobile number to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja requires. */
export declare function normalizeMsisdn(input: string | null | undefined): string | null;
export declare const isMsisdn: (s: string | null | undefined) => boolean;
/** 2547XXXXXXXX -> 2547XX XXX 123 -> shown as +254 7** *** 123 */
export declare const maskMsisdn: (s: string) => string;
/** Minor units (cents) -> whole shillings for Daraja, rounded up. Minimum 1. */
export declare const toShillings: (minor: number) => number;
/** The exact minor-unit amount that actually leaves the customer's M-Pesa for a given intent amount. */
export declare const roundUpToShilling: (minor: number) => number;
/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time (UTC+3, no DST). */
export declare function mpesaTimestamp(d?: Date): string;
/** Daraja TransactionDate (YYYYMMDDHHmmss, EAT) -> Date. */
export declare function parseMpesaTimestamp(v: string | number | null | undefined): Date | null;
export interface StkResult {
    merchantRequestId: string;
    checkoutRequestId: string;
    resultCode: number;
    resultDesc: string;
    success: boolean;
    /** whole shillings actually paid (success only) */
    amountKes?: number;
    receipt?: string;
    phone?: string;
    paidAt?: Date | null;
}
export declare function parseStkCallback(body: unknown): StkResult;
/** Words a customer understands, for each documented Daraja result code. */
export declare function describeStkFailure(code: number, fallback?: string): string;
export interface B2CResult {
    originatorConversationId: string;
    conversationId: string;
    transactionId: string;
    resultCode: number;
    resultDesc: string;
    success: boolean;
    amountKes?: number;
    receiverName?: string;
}
/** Works for both B2C (payout) and TransactionReversal results: they share the Result envelope. */
export declare function parseDarajaResult(body: unknown): B2CResult;
/** Daraja limits: STK push min KES 1, max KES 250,000 per transaction. */
export declare const MPESA_MIN_KES = 1;
export declare const MPESA_MAX_KES = 250000;
