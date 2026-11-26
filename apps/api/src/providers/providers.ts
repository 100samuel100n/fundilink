import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { MpesaClient, MpesaError, mpesaConfigFromEnv } from './mpesa.ts';

/* ============ SMS: Telnyx only DELIVERS the text; codes live in our DB ============ */
@Injectable()
export class Sms {
  private log = new Logger('Sms');
  async send(to: string, text: string) {
    if (!process.env.TELNYX_API_KEY) { this.log.warn(`[dev] SMS to ${to}: ${text}`); return; }
    const r = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.TELNYX_FROM, to, text }),
    });
    if (!r.ok) throw new Error(`Telnyx send failed: ${r.status}`);
  }
}

/* ============ Email: Resend ============ */
@Injectable()
export class Email {
  private log = new Logger('Email');
  async send(to: string, subject: string, html: string) {
    if (!process.env.RESEND_API_KEY) { this.log.warn(`[dev] Email to ${to}: ${subject}`); return; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
    });
    if (!r.ok) throw new Error(`Resend failed: ${r.status}`);
  }
}

/* ============ Push: Firebase Cloud Messaging HTTP v1 (service-account JWT, no SDK needed) ============ */
@Injectable()
export class Push {
  private log = new Logger('Push');
  private tok?: { v: string; exp: number };
  private sa(): { client_email: string; private_key: string; project_id: string } | null {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try { const j = JSON.parse(raw); return { ...j, private_key: String(j.private_key).replace(/\\n/g, '\n') }; } catch { this.log.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON'); return null; }
  }
  private async accessToken(sa: { client_email: string; private_key: string }) {
    if (this.tok && this.tok.exp > Date.now() + 60_000) return this.tok.v;
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'RS256', typ: 'JWT' });
    const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`FCM auth failed: ${r.status}`);
    this.tok = { v: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3000) * 1000 };
    return this.tok.v;
  }
  /** Returns tokens that FCM says are dead so the caller can prune them. */
  async send(tokens: string[], title: string, body: string, data: Record<string, unknown> = {}): Promise<string[]> {
    const sa = this.sa();
    if (!sa) { this.log.warn(`[dev] push "${title}" -> ${tokens.length} device(s)`); return []; }
    const bearer = await this.accessToken(sa);
    const flat = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    const dead: string[] = [];
    await Promise.all(tokens.map(async (token) => {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title, body }, data: flat, android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default' } }, apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } } } }),
      });
      if (r.status === 404 || r.status === 400) { const j: any = await r.json().catch(() => ({})); if (/UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(j))) dead.push(token); }
      else if (!r.ok) this.log.warn(`FCM ${r.status} for a device`);
    }));
    return dead;
  }
}

/* ============ Object storage: Backblaze B2 (S3-compatible), signed URLs only ============ */
@Injectable()
export class Storage {
  private s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
    credentials: { accessKeyId: process.env.S3_KEY_ID ?? '', secretAccessKey: process.env.S3_APP_KEY ?? '' },
  });
  uploadUrl(key: string, contentType: string, ttl = 600) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: ttl });
  }
  downloadUrl(key: string, ttl = 300) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn: ttl });
  }
}

/* ============ Payments: modular provider interface ============ */
export interface ChargeRequest { intentId: string; idempotencyKey: string; amount: number; currency: string; method: 'mpesa' | 'card' | 'bank'; phone?: string; reference: string; description?: string }
export interface ChargeResult { providerRef: string; status: 'pending' | 'succeeded'; message?: string }
export interface QueryResult { status: 'pending' | 'succeeded' | 'failed'; resultCode?: number; reason?: string }
export interface PayoutRequest { idempotencyKey: string; amount: number; currency: string; destination: { kind: string; ref: string; name: string }; remarks?: string }
export interface PaymentProvider {
  readonly name: string;
  /** methods this provider can actually collect; the app only offers these */
  readonly methods: ('mpesa' | 'card' | 'bank')[];
  charge(r: ChargeRequest): Promise<ChargeResult>;
  /** authoritative status check (used by reconciliation and to verify callbacks) */
  query(providerRef: string): Promise<QueryResult>;
  /** 'processing' = accepted by the provider, final result arrives by callback */
  refund(a: { providerRef: string; receipt?: string | null; amount: number; idempotencyKey: string }): Promise<{ providerRef: string; status: 'processed' | 'processing' }>;
  payout(a: PayoutRequest): Promise<{ providerRef: string; status: 'paid' | 'processing'; receipt?: string }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

/** Dev/test provider. Behaves like M-Pesa (async prompt, then a signed webhook) so every flow is exercised without real money. */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly methods: ('mpesa' | 'card' | 'bank')[] = ['mpesa', 'card', 'bank'];
  async charge(r: ChargeRequest): Promise<ChargeResult> { return { providerRef: `mock_${r.intentId}`, status: 'pending' }; }
  async query(): Promise<QueryResult> { return { status: 'pending' }; }
  async refund(a: { idempotencyKey: string }) { return { providerRef: `mock_refund_${a.idempotencyKey}`, status: 'processed' as const }; }
  async payout(a: { idempotencyKey: string }) { return { providerRef: `mock_payout_${a.idempotencyKey}`, status: 'paid' as const, receipt: `MOCK${a.idempotencyKey.slice(-6).toUpperCase()}` }; }
  verifyWebhook(raw: string, sig: string) { return hmacOk(raw, sig); }
}

/** Real money: Safaricom M-Pesa (STK Push in, B2C out, Reversal for refunds). */
export class MpesaProvider implements PaymentProvider {
  readonly name = 'mpesa';
  readonly methods: ('mpesa' | 'card' | 'bank')[] = ['mpesa'];
  readonly client: MpesaClient;
  constructor(client?: MpesaClient) { this.client = client ?? new MpesaClient(mpesaConfigFromEnv()); }
  async charge(r: ChargeRequest): Promise<ChargeResult> {
    if (r.method !== 'mpesa') throw new BadRequestError('Only M-Pesa is available right now.');
    if (!r.phone) throw new BadRequestError('Enter the M-Pesa phone number to charge.');
    try {
      const x = await this.client.stkPush({ amountMinor: r.amount, msisdn: r.phone, accountReference: r.reference, description: r.description ?? 'FundiLink' });
      return { providerRef: x.checkoutRequestId, status: 'pending', message: x.customerMessage };
    } catch (e) { throw wrapMpesa(e); }
  }
  async query(providerRef: string): Promise<QueryResult> {
    const q = await this.client.stkQuery(providerRef);
    return q.status === 'pending' ? { status: 'pending' } : q.status === 'succeeded' ? { status: 'succeeded', resultCode: 0 } : { status: 'failed', resultCode: q.resultCode, reason: q.reason };
  }
  async refund(a: { providerRef: string; receipt?: string | null; amount: number; idempotencyKey: string }) {
    if (!a.receipt) throw new BadRequestError('This payment has no M-Pesa receipt, so it cannot be reversed automatically. Refund it manually from the M-Pesa portal.');
    try { const x = await this.client.reverse({ transactionId: a.receipt, amountMinor: a.amount, remarks: `Refund ${a.idempotencyKey}` }); return { providerRef: x.originatorConversationId || x.conversationId || a.idempotencyKey, status: 'processing' as const }; }
    catch (e) { throw wrapMpesa(e); }
  }
  async payout(a: PayoutRequest) {
    if (a.destination.kind !== 'mobile_money') throw new BadRequestError('Only M-Pesa payouts are automated. Bank payouts are processed by finance.');
    const id = a.idempotencyKey;
    try { const x = await this.client.b2c({ originatorConversationId: id, amountMinor: a.amount, msisdn: a.destination.ref, remarks: a.remarks ?? 'FundiLink payout' }); return { providerRef: x.originatorConversationId, status: 'processing' as const }; }
    catch (e) { throw wrapMpesa(e); }
  }
  verifyWebhook() { return false; } // M-Pesa callbacks are authenticated by secret path + server-side query, see PaymentService.handleMpesa
}

export class BadRequestError extends Error { constructor(m: string) { super(m); this.name = 'BadRequestError'; } }
function wrapMpesa(e: unknown): Error {
  if (e instanceof MpesaError) { const err = new BadRequestError(e.message); (err as any).providerCode = e.code; return err; }
  return e as Error;
}

export function hmacOk(raw: string, signature: string, secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '') {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class Payments {
  provider: PaymentProvider = ((): PaymentProvider => {
    const n = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
    if (n === 'mpesa') return new MpesaProvider();
    if (n !== 'mock') new Logger('Payments').error(`Unknown PAYMENT_PROVIDER "${n}", falling back to mock`);
    return new MockProvider();
  })();
}

/* ============ Maps: route geometry for the live-tracking polyline ============ */
@Injectable()
export class Maps {
  async route(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
    if (process.env.MAPS_PROVIDER === 'mapbox' && process.env.MAPBOX_TOKEN) {
      const u = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${process.env.MAPBOX_TOKEN}`;
      const r = await fetch(u);
      if (r.ok) {
        const j: any = await r.json();
        const rt = j.routes?.[0];
        if (rt) return { coordinates: rt.geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })), distanceKm: rt.distance / 1000, durationMin: Math.round(rt.duration / 60) };
      }
    }
    return null; // caller falls back to straight-line + domain ETA estimate
  }
}

/* ============ AI: Anthropic or OpenAI behind one interface ============ */
@Injectable()
export class Ai {
  async complete(system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
    const max = opts.maxTokens ?? 800;
    if ((process.env.AI_PROVIDER ?? 'anthropic') === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.AI_MODEL ?? 'gpt-4o-mini', max_tokens: max, response_format: opts.json ? { type: 'json_object' } : undefined, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}`);
      return ((await r.json()) as any).choices[0].message.content;
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_MODEL ?? 'claude-sonnet-5-5', max_tokens: max, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}`);
    return ((await r.json()) as any).content[0].text;
  }
}
