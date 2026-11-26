/**
 * Safaricom Daraja client + PaymentProvider adapter.
 *
 *   money in  : STK Push (Lipa na M-Pesa Online)  -> customers paying in-app, professionals topping up their wallet
 *   money out : B2C (BusinessPayment)             -> paying a professional's M-Pesa after a job settles
 *   reversal  : Transaction Reversal              -> refunds
 *
 * Plain classes (no Nest decorators) so the whole file can be exercised against a fake Daraja server in tests.
 * Docs: https://developer.safaricom.co.ke  (sandbox and production differ ONLY by base URL and your credentials).
 */
import { constants, createHash, publicEncrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mpesaTimestamp, normalizeMsisdn, toShillings, MPESA_MAX_KES } from '@fundilink/domain';

export class MpesaError extends Error {
  constructor(message: string, public status = 0, public code?: string, public body?: unknown) { super(message); this.name = 'MpesaError'; }
}

export interface MpesaConfig {
  env: 'sandbox' | 'production';
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** BusinessShortCode on STK requests (paybill number, or the till's head-office store number) */
  shortcode: string;
  passkey: string;
  /** CustomerPayBillOnline (paybill) or CustomerBuyGoodsOnline (till) */
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  /** PartyB on STK: the paybill number, or the till number */
  partyB: string;
  callbackBase: string;
  callbackSecret: string;
  /** B2C + reversal (money out) */
  initiatorName: string;
  initiatorPassword: string;
  securityCredential: string;
  certPem: string;
  b2cShortcode: string;
  b2cCommand: 'BusinessPayment' | 'SalaryPayment' | 'PromotionPayment';
  b2cPath: string;
}

const clean = (v?: string) => (v ?? '').trim();
export function mpesaConfigFromEnv(e: NodeJS.ProcessEnv = process.env): MpesaConfig {
  const env = clean(e.MPESA_ENV) === 'production' ? 'production' : 'sandbox';
  const shortcode = clean(e.MPESA_SHORTCODE);
  let certPem = clean(e.MPESA_CERT_PEM).replace(/\\n/g, '\n');
  if (!certPem && clean(e.MPESA_CERT_PATH)) { try { certPem = readFileSync(clean(e.MPESA_CERT_PATH), 'utf8'); } catch { /* reported by assertMpesaConfig */ } }
  return {
    env,
    baseUrl: clean(e.MPESA_BASE_URL) || (env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'),
    consumerKey: clean(e.MPESA_CONSUMER_KEY), consumerSecret: clean(e.MPESA_CONSUMER_SECRET),
    shortcode, passkey: clean(e.MPESA_PASSKEY),
    transactionType: clean(e.MPESA_TXN_TYPE) === 'CustomerBuyGoodsOnline' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    partyB: clean(e.MPESA_PARTY_B) || clean(e.MPESA_TILL) || shortcode,
    callbackBase: (clean(e.MPESA_CALLBACK_BASE) || clean(e.API_PUBLIC_URL)).replace(/\/$/, ''),
    callbackSecret: clean(e.MPESA_CALLBACK_SECRET),
    initiatorName: clean(e.MPESA_INITIATOR_NAME), initiatorPassword: clean(e.MPESA_INITIATOR_PASSWORD),
    securityCredential: clean(e.MPESA_SECURITY_CREDENTIAL), certPem,
    b2cShortcode: clean(e.MPESA_B2C_SHORTCODE) || shortcode,
    b2cCommand: (['SalaryPayment', 'PromotionPayment'].includes(clean(e.MPESA_B2C_COMMAND)) ? clean(e.MPESA_B2C_COMMAND) : 'BusinessPayment') as MpesaConfig['b2cCommand'],
    b2cPath: clean(e.MPESA_B2C_PATH) || '/mpesa/b2c/v3/paymentrequest',
  };
}

/** Human-readable list of what is missing. Called at boot so a bad production config fails loudly, not on the first customer payment. */
export function mpesaConfigProblems(c: MpesaConfig, opts: { payouts: boolean } = { payouts: true }): string[] {
  const p: string[] = [];
  for (const [k, v] of Object.entries({ MPESA_CONSUMER_KEY: c.consumerKey, MPESA_CONSUMER_SECRET: c.consumerSecret, MPESA_SHORTCODE: c.shortcode, MPESA_PASSKEY: c.passkey, MPESA_CALLBACK_SECRET: c.callbackSecret }))
    if (!v) p.push(`${k} is not set`);
  if (c.callbackSecret && c.callbackSecret.length < 24) p.push('MPESA_CALLBACK_SECRET must be at least 24 random characters');
  if (!/^https:\/\//.test(c.callbackBase)) p.push('MPESA_CALLBACK_BASE (or API_PUBLIC_URL) must be a public https:// URL, Safaricom cannot reach localhost');
  if (c.transactionType === 'CustomerBuyGoodsOnline' && !c.partyB) p.push('MPESA_TILL is required for CustomerBuyGoodsOnline');
  if (opts.payouts) {
    if (!c.initiatorName) p.push('MPESA_INITIATOR_NAME is not set (needed for B2C payouts and refunds)');
    if (!c.securityCredential && !(c.initiatorPassword && c.certPem)) p.push('Set MPESA_SECURITY_CREDENTIAL, or MPESA_INITIATOR_PASSWORD together with MPESA_CERT_PEM / MPESA_CERT_PATH');
    if (!c.b2cShortcode) p.push('MPESA_B2C_SHORTCODE is not set');
  }
  return p;
}

export interface StkPushResult { merchantRequestId: string; checkoutRequestId: string; customerMessage: string }
export type StkQueryResult = { status: 'pending' } | { status: 'succeeded'; resultCode: 0 } | { status: 'failed'; resultCode: number; reason: string };

export class MpesaClient {
  private tok?: { v: string; exp: number };
  private cred?: string;
  constructor(readonly cfg: MpesaConfig = mpesaConfigFromEnv(), private http: typeof fetch = fetch) {}

  /** URL Safaricom calls. The secret path segment is what authenticates the callback (Daraja does not sign callbacks). */
  callbackUrl(kind: 'stk' | 'b2c-result' | 'b2c-timeout' | 'reversal-result' | 'reversal-timeout') {
    return `${this.cfg.callbackBase}/webhooks/pay/${this.cfg.callbackSecret}/${kind}`;
  }

  private async token(force = false): Promise<string> {
    if (!force && this.tok && this.tok.exp > Date.now() + 60_000) return this.tok.v;
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const r = await this.http(`${this.cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new MpesaError('M-Pesa authentication failed. Check MPESA_CONSUMER_KEY / SECRET and MPESA_ENV.', r.status, undefined, j);
    this.tok = { v: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3000) * 1000 };
    return this.tok.v;
  }

  private async call<T = any>(path: string, body: unknown, retried = false): Promise<{ status: number; json: T }> {
    const r = await this.http(`${this.cfg.baseUrl}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${await this.token(retried)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401 && !retried) return this.call(path, body, true);
    const text = await r.text();
    let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: r.status, json };
  }

  /* ---------- money in ---------- */
  async stkPush(i: { amountMinor: number; msisdn: string; accountReference: string; description: string }): Promise<StkPushResult> {
    const msisdn = normalizeMsisdn(i.msisdn);
    if (!msisdn) throw new MpesaError('Enter a valid Safaricom number, e.g. 0712 345 678.', 400, 'bad_phone');
    const kes = toShillings(i.amountMinor);
    if (kes > MPESA_MAX_KES) throw new MpesaError(`M-Pesa allows at most KSh ${MPESA_MAX_KES.toLocaleString('en-KE')} per payment.`, 400, 'too_large');
    const ts = mpesaTimestamp();
    const { status, json } = await this.call('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.cfg.shortcode,
      Password: Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${ts}`).toString('base64'),
      Timestamp: ts,
      TransactionType: this.cfg.transactionType,
      Amount: kes, PartyA: msisdn, PartyB: this.cfg.partyB, PhoneNumber: msisdn,
      CallBackURL: this.callbackUrl('stk'),
      AccountReference: i.accountReference.slice(0, 12), TransactionDesc: i.description.slice(0, 13),
    });
    if (status >= 400 || String(json.ResponseCode) !== '0' || !json.CheckoutRequestID)
      throw new MpesaError(json.errorMessage || json.ResponseDescription || 'M-Pesa could not start the payment. Please try again.', status, json.errorCode ?? json.ResponseCode, json);
    return { merchantRequestId: json.MerchantRequestID, checkoutRequestId: json.CheckoutRequestID, customerMessage: json.CustomerMessage ?? 'Check your phone to approve the payment.' };
  }

  /** Authoritative status of an STK request. Callbacks are only a TRIGGER: we confirm here before crediting anything. */
  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const ts = mpesaTimestamp();
    const { status, json } = await this.call('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.cfg.shortcode, Password: Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${ts}`).toString('base64'), Timestamp: ts, CheckoutRequestID: checkoutRequestId,
    });
    // Still being processed by Safaricom: documented as an HTTP error with this code, not a failure.
    if (json.errorCode === '500.001.1001' || /being processed/i.test(String(json.errorMessage ?? ''))) return { status: 'pending' };
    if (status >= 400 && json.ResultCode == null) throw new MpesaError(json.errorMessage || 'STK query failed', status, json.errorCode, json);
    if (json.ResultCode == null) return { status: 'pending' };
    const code = Number(json.ResultCode);
    return code === 0 ? { status: 'succeeded', resultCode: 0 } : { status: 'failed', resultCode: code, reason: String(json.ResultDesc ?? '') };
  }

  /* ---------- money out ---------- */
  securityCredential(): string {
    if (this.cfg.securityCredential) return this.cfg.securityCredential;
    if (this.cred) return this.cred;
    if (!this.cfg.initiatorPassword || !this.cfg.certPem) throw new MpesaError('M-Pesa initiator credentials are not configured', 500);
    // Daraja: RSA (PKCS#1 v1.5) encrypt the initiator password with Safaricom's public certificate, base64 encode.
    this.cred = publicEncrypt({ key: this.cfg.certPem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(this.cfg.initiatorPassword)).toString('base64');
    return this.cred;
  }

  async b2c(i: { originatorConversationId: string; amountMinor: number; msisdn: string; remarks: string }): Promise<{ conversationId: string; originatorConversationId: string }> {
    const msisdn = normalizeMsisdn(i.msisdn);
    if (!msisdn) throw new MpesaError('The payout phone number is not a valid M-Pesa number', 400, 'bad_phone');
    const { status, json } = await this.call(this.cfg.b2cPath, {
      OriginatorConversationID: i.originatorConversationId,
      InitiatorName: this.cfg.initiatorName, SecurityCredential: this.securityCredential(), CommandID: this.cfg.b2cCommand,
      Amount: toShillings(i.amountMinor), PartyA: this.cfg.b2cShortcode, PartyB: msisdn, Remarks: i.remarks.slice(0, 100),
      QueueTimeOutURL: this.callbackUrl('b2c-timeout'), ResultURL: this.callbackUrl('b2c-result'),
    });
    if (status >= 400 || (json.ResponseCode != null && String(json.ResponseCode) !== '0'))
      throw new MpesaError(json.errorMessage || json.ResponseDescription || 'M-Pesa rejected the payout', status, json.errorCode ?? json.ResponseCode, json);
    return { conversationId: json.ConversationID ?? '', originatorConversationId: json.OriginatorConversationID ?? i.originatorConversationId };
  }

  async reverse(i: { transactionId: string; amountMinor: number; remarks: string }): Promise<{ conversationId: string; originatorConversationId: string }> {
    const { status, json } = await this.call('/mpesa/reversal/v1/request', {
      Initiator: this.cfg.initiatorName, SecurityCredential: this.securityCredential(), CommandID: 'TransactionReversal',
      TransactionID: i.transactionId, Amount: toShillings(i.amountMinor), ReceiverParty: this.cfg.shortcode,
      RecieverIdentifierType: '11', // (sic) Daraja's own spelling
      ResultURL: this.callbackUrl('reversal-result'), QueueTimeOutURL: this.callbackUrl('reversal-timeout'), Remarks: i.remarks.slice(0, 100), Occasion: 'Refund',
    });
    if (status >= 400 || (json.ResponseCode != null && String(json.ResponseCode) !== '0'))
      throw new MpesaError(json.errorMessage || json.ResponseDescription || 'M-Pesa rejected the reversal', status, json.errorCode ?? json.ResponseCode, json);
    return { conversationId: json.ConversationID ?? '', originatorConversationId: json.OriginatorConversationID ?? '' };
  }
}

/** Constant-time check of the secret path segment on callbacks. */
export function callbackSecretOk(given: string, secret = process.env.MPESA_CALLBACK_SECRET ?? ''): boolean {
  if (!secret || !given) return false;
  const a = createHash('sha256').update(given).digest(), b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Optional network allow-list: MPESA_CALLBACK_IPS=ip1,ip2 (Safaricom's published callback source IPs). Empty = not enforced. */
export function callbackIpOk(ip: string | undefined, list = process.env.MPESA_CALLBACK_IPS ?? ''): boolean {
  const allowed = list.split(',').map((x) => x.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const clean = (ip ?? '').replace(/^::ffff:/, '');
  return allowed.includes(clean);
}
