/**
 * Pure M-Pesa (Safaricom Daraja) helpers. No network, no Node-only APIs, so they are shared by the API,
 * the web app and the mobile app and are covered by unit tests.
 *
 * Money in FundiLink is integer minor units (KES cents). M-Pesa moves whole shillings only, so every
 * amount sent to Daraja goes through `toShillings` (rounded UP, never down: the customer is never undercharged).
 */

/** Normalise any common Kenyan way of writing a mobile number to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja requires. */
export function normalizeMsisdn(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = String(input).replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(d)) return null;
  let n: string;
  if (/^254[71]\d{8}$/.test(d)) n = d;
  else if (/^0[71]\d{8}$/.test(d)) n = `254${d.slice(1)}`;
  else if (/^[71]\d{8}$/.test(d)) n = `254${d}`;
  else return null;
  return n;
}

export const isMsisdn = (s: string | null | undefined) => normalizeMsisdn(s) !== null;

/** 2547XXXXXXXX -> 2547XX XXX 123 -> shown as +254 7** *** 123 */
export const maskMsisdn = (s: string) => {
  const n = normalizeMsisdn(s);
  return n ? `+${n.slice(0, 4)} *** *** ${n.slice(-3)}` : '***';
};

/** Minor units (cents) -> whole shillings for Daraja, rounded up. Minimum 1. */
export const toShillings = (minor: number) => Math.max(1, Math.ceil(Number(minor) / 100));
/** The exact minor-unit amount that actually leaves the customer's M-Pesa for a given intent amount. */
export const roundUpToShilling = (minor: number) => toShillings(minor) * 100;

/** Daraja timestamp: YYYYMMDDHHmmss in East Africa Time (UTC+3, no DST). */
export function mpesaTimestamp(d: Date = new Date()): string {
  const eat = new Date(d.getTime() + 3 * 3_600_000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}

/** Daraja TransactionDate (YYYYMMDDHHmmss, EAT) -> Date. */
export function parseMpesaTimestamp(v: string | number | null | undefined): Date | null {
  const s = String(v ?? '');
  if (!/^\d{14}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------ STK push callback ------------------------------ */
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

export function parseStkCallback(body: unknown): StkResult {
  const cb = (body as any)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') throw new Error('Not an STK callback');
  const code = Number(cb.ResultCode);
  const items: { Name: string; Value?: string | number }[] = cb.CallbackMetadata?.Item ?? [];
  const get = (n: string) => items.find((i) => i.Name === n)?.Value;
  const out: StkResult = {
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
    out.paidAt = parseMpesaTimestamp(get('TransactionDate') as any);
    if (!out.receipt || !Number.isFinite(out.amountKes)) throw new Error('Success callback is missing the receipt or amount');
  }
  return out;
}

/** Words a customer understands, for each documented Daraja result code. */
export function describeStkFailure(code: number, fallback = ''): string {
  switch (Number(code)) {
    case 0: return 'Payment received.';
    case 1: return 'Your M-Pesa balance is too low for this payment. Top up and try again.';
    case 1001: return 'Another M-Pesa transaction is in progress on your phone. Wait a moment and try again.';
    case 1019: return 'The payment request expired. Please try again.';
    case 1025: case 1032: return 'You cancelled the M-Pesa request.';
    case 1037: return 'We did not get your M-Pesa PIN in time. Please try again.';
    case 2001: return 'The M-Pesa PIN was wrong. Please try again.';
    case 9999: return 'M-Pesa could not process this request. Please try again.';
    default: return fallback || 'The M-Pesa payment did not go through. You have not been charged.';
  }
}

/* ------------------------------ B2C / reversal result ------------------------------ */
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
export function parseDarajaResult(body: unknown): B2CResult {
  const r = (body as any)?.Result;
  if (!r || r.OriginatorConversationID == null) throw new Error('Not a Daraja result');
  const params: { Key: string; Value?: string | number }[] = r.ResultParameters?.ResultParameter ?? [];
  const get = (k: string) => params.find((p) => p.Key === k)?.Value;
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
export const MPESA_MIN_KES = 1;
export const MPESA_MAX_KES = 250_000;
