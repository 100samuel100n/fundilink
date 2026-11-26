"use strict";
/**
 * Pure M-Pesa (Safaricom Daraja) helpers. No network, no Node-only APIs, so they are shared by the API,
 * the web app and the mobile app and are covered by unit tests.
 *
 * Money in FundiLink is integer minor units (KES cents). M-Pesa moves whole shillings only, so every
 * amount sent to Daraja goes through `toShillings` (rounded UP, never down: the customer is never undercharged).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MPESA_MAX_KES = exports.MPESA_MIN_KES = exports.roundUpToShilling = exports.toShillings = exports.maskMsisdn = exports.isMsisdn = void 0;
exports.normalizeMsisdn = normalizeMsisdn;
exports.mpesaTimestamp = mpesaTimestamp;
exports.parseMpesaTimestamp = parseMpesaTimestamp;
exports.parseStkCallback = parseStkCallback;
exports.describeStkFailure = describeStkFailure;
exports.parseDarajaResult = parseDarajaResult;
/** Normalise any common Kenyan way of writing a mobile number to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja requires. */
function normalizeMsisdn(input) {
    if (!input)
        return null;
    const d = String(input).replace(/[\s\-().]/g, '').replace(/^\+/, '');
    if (!/^\d+$/.test(d))
        return null;
    let n;
    if (/^254[71]\d{8}$/.test(d))
        n = d;
    else if (/^0[71]\d{8}$/.test(d))
        n = `254${d.slice(1)}`;
    else if (/^[71]\d{8}$/.test(d))
        n = `254${d}`;
    else
        return null;
    return n;
}
const isMsisdn = (s) => normalizeMsisdn(s) !== null;
exports.isMsisdn = isMsisdn;
/** 2547XXXXXXXX -> 2547XX XXX 123 -> shown as +254 7** *** 123 */
const maskMsisdn = (s) => {
    const n = normalizeMsisdn(s);
    return n ? `+${n.slice(0, 4)} *** *** ${n.slice(-3)}` : '***';
};
exports.maskMsisdn = maskMsisdn;
/** Minor units (cents) -> whole shillings for Daraja, rounded up. Minimum 1. */
const toShillings = (minor) => Math.max(1, Math.ceil(Number(minor) / 100));
exports.toShillings = toShillings;
/** The exact minor-unit amount that actually leaves the customer's M-Pesa for a given intent amount. */
const roundUpToShilling = (minor) => (0, exports.toShillings)(minor) * 100;
exports.roundUpToShilling = roundUpToShilling;
/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time (UTC+3, no DST). */
function mpesaTimestamp(d = new Date()) {
    const eat = new Date(d.getTime() + 3 * 3_600_000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}
/** Daraja TransactionDate (YYYYMMDDHHmmss, EAT) -> Date. */
function parseMpesaTimestamp(v) {
    const s = String(v ?? '');
    if (!/^\d{14}$/.test(s))
        return null;
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+03:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}
function parseStkCallback(body) {
    const cb = body?.Body?.stkCallback;
    if (!cb || typeof cb.CheckoutRequestID !== 'string')
        throw new Error('Not an STK callback');
    const code = Number(cb.ResultCode);
    const items = cb.CallbackMetadata?.Item ?? [];
    const get = (n) => items.find((i) => i.Name === n)?.Value;
    const out = {
        merchantRequestId: String(cb.MerchantRequestID ?? ''),
        checkoutRequestId: cb.CheckoutRequestID,
        resultCode: code,
        resultDesc: String(cb.ResultDesc ?? ''),
        success: code === 0,
    };
    if (code === 0) {
        out.amountKes = Number(get('Amount'));
        out.receipt = String(get('MpesaReceiptNumber') ?? '');
        out.phone = get('PhoneNumber') != null ? String(get('PhoneNumber')) : undefined;
        out.paidAt = parseMpesaTimestamp(get('TransactionDate'));
        if (!out.receipt || !Number.isFinite(out.amountKes))
            throw new Error('Success callback is missing the receipt or amount');
    }
    return out;
}
/** Words a customer understands, for each documented Daraja result code. */
function describeStkFailure(code, fallback = '') {
    switch (Number(code)) {
        case 0: return 'Payment received.';
        case 1: return 'Your M-Pesa balance is too low for this payment. Top up and try again.';
        case 1001: return 'Another M-Pesa transaction is in progress on your phone. Wait a moment and try again.';
        case 1019: return 'The payment request expired. Please try again.';
        case 1025:
        case 1032: return 'You cancelled the M-Pesa request.';
        case 1037: return 'We did not get your M-Pesa PIN in time. Please try again.';
        case 2001: return 'The M-Pesa PIN was wrong. Please try again.';
        case 9999: return 'M-Pesa could not process this request. Please try again.';
        default: return fallback || 'The M-Pesa payment did not go through. You have not been charged.';
    }
}
/** Works for both B2C (payout) and TransactionReversal results: they share the Result envelope. */
function parseDarajaResult(body) {
    const r = body?.Result;
    if (!r || r.OriginatorConversationID == null)
        throw new Error('Not a Daraja result');
    const params = r.ResultParameters?.ResultParameter ?? [];
    const get = (k) => params.find((p) => p.Key === k)?.Value;
    const code = Number(r.ResultCode);
    return {
        originatorConversationId: String(r.OriginatorConversationID),
        conversationId: String(r.ConversationID ?? ''),
        transactionId: String(r.TransactionID ?? get('TransactionID') ?? ''),
        resultCode: code,
        resultDesc: String(r.ResultDesc ?? ''),
        success: code === 0,
        amountKes: get('TransactionAmount') != null ? Number(get('TransactionAmount')) : undefined,
        receiverName: get('ReceiverPartyPublicName') != null ? String(get('ReceiverPartyPublicName')) : undefined,
    };
}
/** Daraja limits: STK push min KES 1, max KES 250,000 per transaction. */
exports.MPESA_MIN_KES = 1;
exports.MPESA_MAX_KES = 250_000;
