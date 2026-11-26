import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Injectable, Logger, NotFoundException, Param, Post, Req,
} from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  describeStkFailure, maskMsisdn, normalizeMsisdn, parseDarajaResult, parseStkCallback, roundUpToShilling, validateTopup, walletAccount,
  type B2CResult, type StkResult,
} from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, Audit, Public, Perm, parse, postLedger } from '../common/core.ts';
import { Payments } from '../providers/providers.ts';
import { callbackIpOk, callbackSecretOk } from '../providers/mpesa.ts';
import { BookingService } from './bookings.ts';
import { WalletService } from './wallet.ts';
import { Notifier } from './notifier.ts';

const PSP = 'PSP_HOLDING', REVENUE = 'PLATFORM_REVENUE', TAX = 'TAX_PAYABLE', UNALLOCATED = 'UNALLOCATED_FUNDS', ADJUSTMENTS = 'PLATFORM_ADJUSTMENTS';
const proAcct = (id: string) => `PRO_PAYABLE:${id}`;
const kes = (minor: number | string) => `KSh ${(Number(minor) / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
const receiptNo = () => `RC-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
type After = Array<() => Promise<unknown>>;

/** Provider errors carry plain messages meant for the customer; surface them as 400s rather than 500s. */
function asHttp(e: unknown): Error {
  const x = e as any;
  return x?.name === 'BadRequestError' ? new BadRequestException(x.message) : (e as Error);
}

@Injectable()
export class PaymentService {
  private log = new Logger('Payments');

  constructor(private db: Db, private pay: Payments, private bookings: BookingService, private audit: Audit, private wallet: WalletService, private notifier: Notifier) {
    // Booking events that move money. Wired here (not injected) so BookingService stays free of a circular dependency.
    this.bookings.onCompleted = (id) => this.onBookingCompleted(id).catch((e) => this.log.error(`post-completion for ${id}: ${e}`));
    this.bookings.onRefundDue = (id, reason) => this.autoRefund(id, reason).catch((e) => this.log.error(`auto-refund for ${id}: ${e}`));
  }

  /* =====================================================================================================
     Public configuration: the apps only offer what the server can really do.
     ===================================================================================================== */
  async config() {
    const s = await this.wallet.settings();
    const flag = async (key: string) => { const r = await this.db.one<any>('SELECT value FROM platform_settings WHERE key=$1', [key]); return r ? r.value === true || r.value === 'true' : true; };
    return {
      provider: this.pay.provider.name, methods: this.pay.provider.methods,
      escrowEnabled: await flag('payments.escrow_enabled'), directEnabled: await flag('payments.direct_enabled'),
      wallet: { minTopup: s.minTopup, maxTopup: s.maxTopup },
    };
  }

  /* =====================================================================================================
     Collecting money
     ===================================================================================================== */

  /** Idempotency-key is supplied by the client per "Pay" press; a double-tap returns the same intent. */
  async startPayment(u: AuthUser, i: { bookingId: string; method: 'mpesa' | 'card' | 'bank'; phone?: string; idempotencyKey: string }) {
    const existing = await this.db.one<any>('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]);
    if (existing) { if (existing.user_id !== u.id) throw new ForbiddenException(); return this.view(existing); }
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [i.bookingId]);
    if (!b || b.customer_id !== u.id) throw new ForbiddenException();
    if (b.payment_mode !== 'escrow') throw new BadRequestException('This booking is paid directly to the professional.');
    if (b.status !== 'pending_payment') throw new BadRequestException('Booking is not awaiting payment');
    const live = await this.db.one<any>(`SELECT * FROM payment_intents WHERE booking_id=$1 AND purpose='booking' AND status IN ('created','pending') AND created_at > now() - interval '90 seconds' ORDER BY created_at DESC LIMIT 1`, [b.id]);
    if (live) return this.view(live); // the customer already has a prompt on their phone: do not send a second one
    return this.createIntent(u, { purpose: 'booking', bookingId: b.id, subjectId: null, amount: Number(b.total), currency: b.currency, method: i.method, phone: i.phone, key: i.idempotencyKey, reference: b.reference, description: 'FundiLink' });
  }

  /** Customer pays for an approved add-on ("extra work") through the same escrow. */
  async startAddonPayment(u: AuthUser, i: { revisionId: string; phone?: string; idempotencyKey: string; method?: 'mpesa' | 'card' | 'bank' }) {
    const existing = await this.db.one<any>('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]);
    if (existing) { if (existing.user_id !== u.id) throw new ForbiddenException(); return this.view(existing); }
    const r = await this.db.one<any>(`SELECT r.*, b.customer_id, b.reference, b.currency, b.payment_mode FROM quotation_revisions r JOIN bookings b ON b.id=r.booking_id WHERE r.id=$1`, [i.revisionId]);
    if (!r || r.customer_id !== u.id) throw new ForbiddenException();
    if (r.payment_mode !== 'escrow') throw new BadRequestException('Extra work on this booking is paid directly to the professional.');
    if (r.status !== 'approved' || r.payment_status !== 'due') throw new BadRequestException(r.payment_status === 'paid' ? 'This extra work is already paid' : 'This extra work is not awaiting payment');
    const live = await this.db.one<any>(`SELECT * FROM payment_intents WHERE purpose='addon' AND subject_id=$1 AND status IN ('created','pending') AND created_at > now() - interval '90 seconds' LIMIT 1`, [r.id]);
    if (live) return this.view(live);
    return this.createIntent(u, { purpose: 'addon', bookingId: r.booking_id, subjectId: r.id, amount: Number(r.extra_total), currency: r.currency, method: i.method ?? 'mpesa', phone: i.phone, key: i.idempotencyKey, reference: r.reference, description: 'Extra work' });
  }

  /** Professional tops up the prepaid wallet that pays platform commission on pay-on-site jobs. */
  async startTopup(u: AuthUser, i: { amount: number; phone?: string; idempotencyKey: string; method?: 'mpesa' | 'card' | 'bank' }) {
    const existing = await this.db.one<any>('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]);
    if (existing) { if (existing.user_id !== u.id) throw new ForbiddenException(); return this.view(existing); }
    const p = await this.db.one<any>(`SELECT id, status FROM professional_profiles WHERE user_id=$1`, [u.id]);
    if (!p) throw new ForbiddenException('Only professionals have a wallet');
    const s = await this.wallet.settings();
    try { validateTopup(i.amount, { min: s.minTopup, max: s.maxTopup }); }
    catch (e: any) { throw new BadRequestException(`${e.message} (KSh ${s.minTopup / 100} to KSh ${(s.maxTopup / 100).toLocaleString('en-KE')})`); }
    const live = await this.db.one<any>(`SELECT * FROM payment_intents WHERE purpose='wallet_topup' AND subject_id=$1 AND status IN ('created','pending') AND created_at > now() - interval '90 seconds' LIMIT 1`, [p.id]);
    if (live) return this.view(live);
    return this.createIntent(u, { purpose: 'wallet_topup', bookingId: null, subjectId: p.id, amount: i.amount, currency: 'KES', method: i.method ?? 'mpesa', phone: i.phone, key: i.idempotencyKey, reference: 'WALLET', description: 'FundiLink' });
  }

  private async createIntent(u: AuthUser, a: { purpose: string; bookingId: string | null; subjectId: string | null; amount: number; currency: string; method: 'mpesa' | 'card' | 'bank'; phone?: string; key: string; reference: string; description: string }) {
    const provider = this.pay.provider;
    if (!provider.methods.includes(a.method)) throw new BadRequestException(a.method === 'mpesa' ? 'M-Pesa is not available right now.' : 'That payment method is not available yet. Please pay with M-Pesa.');
    let phone: string | undefined;
    if (a.method === 'mpesa') {
      phone = normalizeMsisdn(a.phone) ?? undefined;
      if (!phone) throw new BadRequestException('Enter a valid Safaricom number, e.g. 0712 345 678.');
    }
    const intent = await this.db.one<any>(
      `INSERT INTO payment_intents (booking_id, user_id, idempotency_key, provider, method, amount, currency, status, purpose, subject_id, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'created',$8,$9,$10) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [a.bookingId, u.id, a.key, provider.name, a.method, a.amount, a.currency, a.purpose, a.subjectId, phone ?? null]);
    if (!intent) return this.view((await this.db.one<any>('SELECT * FROM payment_intents WHERE idempotency_key=$1', [a.key]))!); // lost a double-tap race: nothing charged twice

    try {
      const r = await provider.charge({ intentId: intent.id, idempotencyKey: a.key, amount: a.amount, currency: a.currency, method: a.method, phone, reference: a.reference, description: a.description });
      const row = await this.db.one<any>(`UPDATE payment_intents SET provider_ref=$2, status='pending', updated_at=now() WHERE id=$1 RETURNING *`, [intent.id, r.providerRef]);
      this.mockAutoConfirm(row);
      return this.view(row, r.message);
    } catch (e) {
      await this.db.query(`UPDATE payment_intents SET status='failed', failure_reason=$2, updated_at=now() WHERE id=$1`, [intent.id, String((e as Error).message).slice(0, 300)]);
      throw asHttp(e);
    }
  }

  /** Mock provider only: behave like an M-Pesa prompt the customer approves ~2 s later, through the SAME webhook path real money uses. */
  private mockAutoConfirm(pi: any) {
    if (this.pay.provider.name !== 'mock') return;
    if (!(process.env.ENABLE_DEMO === 'true' || process.env.NODE_ENV !== 'production') || process.env.MOCK_AUTO_CONFIRM === 'false' || !process.env.PAYMENT_WEBHOOK_SECRET) return;
    const raw = JSON.stringify({ id: `evt_${pi.id}`, type: 'payment.succeeded', data: { providerRef: pi.provider_ref, amount: roundUpToShilling(Number(pi.amount)), fee: Math.round(Number(pi.amount) * 0.015) } });
    const sig = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');
    setTimeout(() => { this.handleWebhook(raw, sig).catch((e) => this.log.warn(`mock webhook: ${e}`)); }, 2000);
  }

  /** What the apps see. Never leaks provider internals or the full phone number. */
  view(pi: any, message?: string) {
    const created = new Date(pi.created_at).getTime();
    return {
      id: pi.id, status: pi.status as string, purpose: pi.purpose, method: pi.method, amount: pi.amount, currency: pi.currency,
      provider_ref: pi.provider_ref ?? null, receipt: pi.provider_receipt ?? null, failure_reason: pi.failure_reason ?? null,
      phone: pi.phone ? maskMsisdn(pi.phone) : null, created_at: pi.created_at, expires_at: new Date(created + 120_000).toISOString(),
      message: message ?? (pi.status === 'pending' && pi.method === 'mpesa' ? 'Check your phone and enter your M-Pesa PIN.' : undefined),
    };
  }

  /** Polled by the apps while the customer approves the prompt. Doubles as an opportunistic status check, so payments settle
   *  within seconds even if Safaricom's callback is late (or cannot reach a local machine). */
  async getIntent(u: AuthUser, id: string) {
    let pi = await this.db.one<any>('SELECT * FROM payment_intents WHERE id=$1', [id]);
    if (!pi) throw new NotFoundException();
    if (pi.user_id !== u.id && !u.perms.includes('transactions.read') && !u.perms.includes('*')) throw new ForbiddenException();
    if (pi.status === 'pending' && pi.provider === 'mpesa' && Date.now() - new Date(pi.created_at).getTime() > 12_000 && Date.now() - new Date(pi.updated_at).getTime() > 8_000) {
      await this.db.query('UPDATE payment_intents SET updated_at=now() WHERE id=$1', [pi.id]);
      await this.confirmFromProvider(pi.provider_ref).catch((e) => this.log.warn(`status check ${pi.id}: ${e}`));
      pi = await this.db.one<any>('SELECT * FROM payment_intents WHERE id=$1', [id]);
    }
    return this.view(pi);
  }

  /* =====================================================================================================
     Webhooks
     ===================================================================================================== */

  /** Generic HMAC-signed webhook (mock provider and any future provider that signs its callbacks). */
  async handleWebhook(raw: string, signature: string) {
    const valid = this.pay.provider.verifyWebhook(raw, signature);
    const evt = JSON.parse(raw) as { id: string; type: string; data: { providerRef: string; amount: number; fee?: number; receipt?: string } };
    const stored = await this.db.one(
      `INSERT INTO payment_events (provider, event_id, payload, signature_valid) VALUES ($1,$2,$3,$4) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`,
      [this.pay.provider.name, evt.id, raw, valid]);
    if (!valid) throw new ForbiddenException('Invalid signature');
    if (!stored) return { duplicate: true };
    if (evt.type === 'payment.succeeded') await this.onPaid(evt.data);
    await this.db.query('UPDATE payment_events SET processed_at=now() WHERE id=$1', [(stored as any).id]);
    return { ok: true };
  }

  /**
   * Safaricom callbacks. Daraja does not sign them, so security is layered:
   *   1. the callback URL contains a long random secret (constant-time compared), optionally plus an IP allow-list;
   *   2. a callback is only a TRIGGER: before any money is credited we ask Safaricom directly (STK Query) and trust only that answer;
   *   3. amounts are compared with what we asked for; 4. events are de-duplicated; 5. a reconciliation job catches missed callbacks.
   * Always answers 200 once authenticated, otherwise Safaricom would retry and we would double-process.
   */
  async handleMpesa(secret: string, kind: string, body: unknown, ip?: string) {
    if (!callbackSecretOk(secret) || !callbackIpOk(ip)) throw new NotFoundException();
    const ack = { ResultCode: 0, ResultDesc: 'Accepted' };
    try {
      if (kind === 'stk') {
        const r = parseStkCallback(body);
        if (!(await this.storeEvent(`stk:${r.checkoutRequestId}:${r.resultCode}`, body))) return ack;
        await this.confirmFromProvider(r.checkoutRequestId, r);
      } else if (kind === 'b2c-result' || kind === 'b2c-timeout' || kind === 'reversal-result' || kind === 'reversal-timeout') {
        const r = parseDarajaResult(body);
        if (!(await this.storeEvent(`${kind}:${r.originatorConversationId}:${r.resultCode}`, body))) return ack;
        if (kind.startsWith('b2c')) await this.onPayoutResult(r, kind.endsWith('timeout'));
        else await this.onReversalResult(r, kind.endsWith('timeout'));
      }
    } catch (e) { this.log.error(`mpesa ${kind} callback: ${(e as Error).message}`); }
    return ack;
  }

  private async storeEvent(id: string, body: unknown) {
    const row = await this.db.one(`INSERT INTO payment_events (provider, event_id, payload, signature_valid, processed_at) VALUES ('mpesa',$1,$2,true,now()) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`, [id, JSON.stringify(body)]);
    return !!row;
  }

  /** Ask the provider for the truth, then act on it. Safe to call any number of times. */
  async confirmFromProvider(providerRef: string | null, hint?: StkResult) {
    if (!providerRef) return;
    const pi = await this.db.one<any>(`SELECT * FROM payment_intents WHERE provider_ref=$1`, [providerRef]);
    if (!pi || pi.status === 'succeeded' || pi.status === 'cancelled') return;
    const q = await this.pay.provider.query(providerRef);
    if (q.status === 'pending') return;
    if (q.status === 'failed') return this.markFailed(pi, q.resultCode ?? hint?.resultCode ?? -1, q.reason);
    if (hint?.success && hint.amountKes != null && hint.amountKes * 100 !== roundUpToShilling(Number(pi.amount))) {
      this.log.error(`amount mismatch on ${pi.id}: callback ${hint.amountKes} KES, expected ${roundUpToShilling(Number(pi.amount)) / 100}`);
      return;
    }
    await this.onPaid({ providerRef, amount: roundUpToShilling(Number(pi.amount)), receipt: hint?.receipt, phone: hint?.phone });
  }

  private async markFailed(pi: any, code: number, reason?: string) {
    const msg = describeStkFailure(code, reason);
    await this.db.query(`UPDATE payment_intents SET status='failed', failure_reason=$2, result_code=$3, updated_at=now() WHERE id=$1 AND status IN ('created','pending')`, [pi.id, msg, code]);
  }

  /** Safety net, run every ~30 s: settles prompts whose callback never arrived and expires prompts nobody answered. */
  async reconcilePending() {
    const rows = await this.db.query<any>(`SELECT * FROM payment_intents WHERE status='pending' AND provider='mpesa' AND created_at < now() - interval '25 seconds' AND created_at > now() - interval '3 hours' ORDER BY created_at LIMIT 50`);
    for (const pi of rows) {
      await this.confirmFromProvider(pi.provider_ref).catch((e) => this.log.warn(`reconcile ${pi.id}: ${e}`));
      const fresh = await this.db.one<any>('SELECT status, created_at FROM payment_intents WHERE id=$1', [pi.id]);
      if (fresh?.status === 'pending' && Date.now() - new Date(fresh.created_at).getTime() > 10 * 60_000)
        await this.db.query(`UPDATE payment_intents SET status='failed', failure_reason='The M-Pesa request timed out. If money left your account it will be matched automatically; otherwise try again.', updated_at=now() WHERE id=$1 AND status='pending'`, [pi.id]);
    }
    return rows.length;
  }

  /* =====================================================================================================
     A payment is confirmed: split it exactly once.
     ===================================================================================================== */
  private async onPaid(d: { providerRef: string; amount: number; fee?: number; receipt?: string; phone?: string }) {
    const after: After = [];
    await this.db.tx(async (c) => {
      const pi = (await c.query(`SELECT * FROM payment_intents WHERE provider_ref=$1 FOR UPDATE`, [d.providerRef])).rows[0];
      if (!pi || pi.status === 'succeeded') return;
      const expected = roundUpToShilling(Number(pi.amount));
      if (Number(d.amount) !== expected) throw new Error(`Payment amount mismatch on ${pi.id}: got ${d.amount}, expected ${expected}`); // never trust, always compare
      await c.query(`UPDATE payment_intents SET status='succeeded', provider_receipt=COALESCE($2,provider_receipt), failure_reason=NULL, paid_at=now(), updated_at=now() WHERE id=$1`, [pi.id, d.receipt ?? null]);
      const gross = d.amount;

      switch (pi.purpose) {
        case 'booking': case 'milestone': await this.onBookingPaid(c, pi, gross, d.fee, after); break;
        case 'addon': await this.onAddonPaid(c, pi, gross, after); break;
        case 'wallet_topup': await this.onTopupPaid(c, pi, gross, after); break;
        default: await this.onNonBookingPaid(c, pi, gross);
      }
    });
    for (const f of after) await f().catch((e) => this.log.warn(`post-payment step: ${e}`));
  }

  private async onBookingPaid(c: any, pi: any, gross: number, fee: number | undefined, after: After) {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [pi.booking_id])).rows[0];
    if (!b) throw new Error(`Payment ${pi.id} has no booking`);
    if (b.status !== 'pending_payment') return this.lateFunds(c, pi, gross, `Payment arrived while the booking was ${b.status.replace(/_/g, ' ')}`, after);

    const net = Number(b.professional_net), tax = Number(b.tax), revenue = gross - net - tax;
    await c.query('UPDATE payment_intents SET split=$2 WHERE id=$1', [pi.id, JSON.stringify({ gross, net, revenue, tax })]);
    await postLedger(c, `payment:${pi.id}`, 'payment_received', b.id, [
      { account: PSP, debit: gross }, { account: proAcct(b.professional_id), credit: net }, { account: REVENUE, credit: revenue }, { account: TAX, credit: tax },
    ]);
    if (fee) await postLedger(c, `psp-fee:${pi.id}`, 'psp_fee', b.id, [{ account: 'PSP_FEES_EXPENSE', debit: fee }, { account: PSP, credit: fee }]);
    await c.query(`INSERT INTO receipts (payment_intent_id, number) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pi.id, receiptNo()]);

    await this.bookings.move(c, b.id, 'awaiting_acceptance', 'system', null, { paymentConfirmed: true });
    const pro = (await c.query('SELECT auto_accept FROM professional_profiles WHERE id=$1', [b.professional_id])).rows[0];
    if (pro.auto_accept && b.kind === 'instant') {
      await this.bookings.move(c, b.id, 'confirmed', 'system', null, {});
      await this.bookings.move(c, b.id, 'scheduled', 'system', null, {});
    }
    after.push(
      () => this.notifier.send(b.customer_id, { template: 'payment_received', title: 'Payment received', body: `${kes(gross)} is held safely until the job is done. We have asked your professional to accept.`, data: { bookingId: b.id } }),
      async () => this.notifier.send(await this.notifier.proUsers(b.professional_id), { template: 'booking_request', title: b.kind === 'emergency' ? 'Emergency request' : 'New booking request', body: `${b.description?.slice(0, 80) ?? 'A customer wants to book you'} · ${kes(b.professional_net)} after commission. Accept soon: requests expire.`, data: { bookingId: b.id }, channels: b.kind === 'emergency' ? ['in_app', 'push', 'sms'] : ['in_app', 'push'] }),
    );
  }

  private async onAddonPaid(c: any, pi: any, gross: number, after: After) {
    const r = (await c.query('SELECT * FROM quotation_revisions WHERE id=$1 FOR UPDATE', [pi.subject_id])).rows[0];
    const b = r && (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [r.booking_id])).rows[0];
    if (!r || !b) throw new Error(`Add-on payment ${pi.id} has no revision`);
    if (!['arrived', 'in_progress', 'awaiting_completion'].includes(b.status) || r.payment_status !== 'due')
      return this.lateFunds(c, pi, gross, `Extra-work payment arrived while the booking was ${b.status.replace(/_/g, ' ')}`, after);
    const net = Number(r.extra_net), revenue = gross - net;
    await c.query('UPDATE payment_intents SET split=$2 WHERE id=$1', [pi.id, JSON.stringify({ gross, net, revenue, tax: 0 })]);
    await postLedger(c, `addon:${pi.id}`, 'addon_payment', b.id, [{ account: PSP, debit: gross }, { account: proAcct(b.professional_id), credit: net }, { account: REVENUE, credit: revenue }]);
    await c.query(`UPDATE quotation_revisions SET payment_status='paid', paid_at=now(), payment_intent_id=$2 WHERE id=$1`, [r.id, pi.id]);
    await c.query(`INSERT INTO receipts (payment_intent_id, number) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pi.id, receiptNo()]);
    after.push(
      () => this.notifier.send(b.customer_id, { template: 'addon_paid', title: 'Extra work paid', body: `${kes(gross)} received for the extra work on ${b.reference}. Receipt issued.`, data: { bookingId: b.id, revisionId: r.id } }),
      async () => this.notifier.send(await this.notifier.proUsers(b.professional_id), { template: 'addon_paid', title: 'Extra work approved and paid', body: `The customer paid ${kes(gross)} for the extra work. You can go ahead.`, data: { bookingId: b.id, revisionId: r.id } }),
    );
  }

  private async onTopupPaid(c: any, pi: any, gross: number, after: After) {
    const proId = pi.subject_id as string;
    await c.query('UPDATE payment_intents SET split=$2 WHERE id=$1', [pi.id, JSON.stringify({ gross, net: 0, revenue: 0, tax: 0, wallet: true })]);
    await postLedger(c, `topup:${pi.id}`, 'wallet_topup', null, [{ account: PSP, debit: gross }, { account: walletAccount(proId), credit: gross }]);
    await c.query(`INSERT INTO receipts (payment_intent_id, number) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pi.id, receiptNo()]);
    after.push(async () => {
      const bal = await this.wallet.balance(proId);
      await this.notifier.send(await this.notifier.proUsers(proId), { template: 'wallet_topup', title: 'Wallet topped up', body: `${kes(gross)} added. Your balance is ${kes(bal)}.`, data: { balance: bal } });
    });
  }

  /** Subscriptions, activation fees and equipment deposits: platform revenue / held deposit, never mixed with professional payables. */
  private async onNonBookingPaid(c: any, pi: any, amt: number) {
    if (pi.purpose === 'equipment_deposit') {
      await postLedger(c, `deposit:${pi.id}`, 'equipment_deposit', null, [{ account: PSP, debit: amt }, { account: 'DEPOSITS_HELD', credit: amt }]);
      await c.query(`UPDATE equipment_rentals SET status='active' WHERE id=$1 AND status='approved'`, [pi.subject_id]);
      return;
    }
    await postLedger(c, `${pi.purpose}:${pi.id}`, pi.purpose, null, [{ account: PSP, debit: amt }, { account: REVENUE, credit: amt }]);
    if (pi.purpose === 'subscription') {
      await c.query(`UPDATE subscription_invoices SET status='paid' WHERE payment_intent_id=$1`, [pi.id]);
      await c.query(`UPDATE subscriptions SET status='active', current_period_end = GREATEST(current_period_end, now()) + interval '1 month' WHERE id=$1`, [pi.subject_id]);
    }
    if (pi.purpose === 'activation') {
      await c.query(`INSERT INTO activation_payments (professional_id, payment_intent_id, paid_at) VALUES ($1,$2,now()) ON CONFLICT (professional_id) DO UPDATE SET payment_intent_id=EXCLUDED.payment_intent_id`, [pi.subject_id, pi.id]);
      await c.query(`UPDATE professional_profiles SET activated_at=COALESCE(activated_at, now()) WHERE id=$1`, [pi.subject_id]);
    }
  }

  /** Money arrived for something that can no longer use it (customer paid after the request was cancelled, a prompt approved very late...).
   *  It is parked in UNALLOCATED_FUNDS and returned to the customer automatically. Money is never silently kept. */
  private async lateFunds(c: any, pi: any, gross: number, why: string, after: After) {
    await c.query('UPDATE payment_intents SET split=$2 WHERE id=$1', [pi.id, JSON.stringify({ gross, net: 0, revenue: 0, tax: 0, unallocated: true })]);
    await postLedger(c, `late:${pi.id}`, 'unallocated_funds', pi.booking_id, [{ account: PSP, debit: gross }, { account: UNALLOCATED, credit: gross }]);
    const refund = (await c.query(`INSERT INTO refunds (booking_id, payment_intent_id, amount, reason, requested_by, system_initiated) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
      [pi.booking_id, pi.id, gross, why, pi.user_id])).rows[0];
    after.push(async () => {
      await this.executeRefund(refund.id, null);
      await this.notifier.send(pi.user_id, { template: 'payment_refunded', title: 'Payment being returned', body: `${kes(gross)} arrived after your request was closed, so we are sending it back to your M-Pesa.`, data: { bookingId: pi.booking_id } });
    });
  }

  /* =====================================================================================================
     Escrow settlement: pay the professional
     ===================================================================================================== */

  /** A booking was completed (customer confirmed, or the review window lapsed, or an admin resolved a dispute). */
  async onBookingCompleted(bookingId: string) {
    const b = await this.db.one<any>('SELECT id, payment_mode, status FROM bookings WHERE id=$1', [bookingId]);
    if (!b || b.status !== 'completed') return;
    if (b.payment_mode === 'direct') await this.chargeDirectCommission(bookingId);
    else await this.queueSettlement(bookingId);
  }

  /** Customer confirmed (or window lapsed): move money from "held" to payable-out via a settlement record. */
   async queueSettlement(bookingId: string) {
    let recovered = 0; let proId = '';
    await this.db.tx(async (c) => {
      const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
      if (!b || b.status !== 'completed' || b.payment_mode !== 'escrow') return;
      proId = b.professional_id;
      await this.bookings.move(c, bookingId, 'settlement_pending', 'system', null, {});
      // If the professional owes pay-on-site commission (negative wallet), clear it from this in-app payout first.
      const wb = Number((await c.query(`SELECT COALESCE(SUM(credit) - SUM(debit), 0)::bigint AS b FROM ledger_entries WHERE account=$1`, [walletAccount(b.professional_id)])).rows[0].b);
      const net = Number(b.professional_net);
      recovered = Math.max(0, Math.min(-wb, net));
      if (recovered > 0) await postLedger(c, `wallet-netting:${b.id}`, 'wallet_netting', b.id, [{ account: proAcct(b.professional_id), debit: recovered }, { account: walletAccount(b.professional_id), credit: recovered }]);
      const pay = net - recovered;
      if (pay === 0) { await this.bookings.move(c, bookingId, 'settled', 'system', null, {}); return; } // the whole payout cleared the debt
      const acct = (await c.query('SELECT id FROM payout_accounts WHERE professional_id=$1 AND active LIMIT 1', [b.professional_id])).rows[0];
      const s = (await c.query(
        `INSERT INTO settlements (professional_id, payout_account_id, amount, idempotency_key) VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
        [b.professional_id, acct?.id ?? null, pay, `settle:${bookingId}`])).rows[0];
      if (s) await c.query('INSERT INTO settlement_items (settlement_id, booking_id, amount) VALUES ($1,$2,$3)', [s.id, bookingId, pay]);
    });
    if (recovered > 0) void this.notifier.send(await this.notifier.proUsers(proId), { template: 'wallet_netting', title: 'Wallet balance recovered', body: `${kes(recovered)} from this job cleared the commission you owed on pay-on-site jobs.`, data: { bookingId } }).catch(() => {});
    // try to pay straight away; the housekeeping job retries anything that does not go through
    const s = await this.db.one<any>(`SELECT id FROM settlements WHERE idempotency_key=$1`, [`settle:${bookingId}`]);
    if (s) await this.processSettlement(s.id).catch((e) => this.log.warn(`instant settlement ${s.id}: ${e}`));
  }
  
  /** Worker: pay out pending settlements through the provider. Claimed atomically so two workers can never pay twice. */
  async processSettlement(settlementId: string) {
    const s = await this.db.one<any>(
      `SELECT s.*, a.kind, a.provider, a.account_name, convert_from(a.account_ref_encrypted,'UTF8') ref FROM settlements s LEFT JOIN payout_accounts a ON a.id=s.payout_account_id WHERE s.id=$1 AND s.status IN ('pending','failed')`, [settlementId]);
    if (!s || !s.ref) return; // no payout account yet: stays pending until the professional adds one
    if (this.pay.provider.name === 'mpesa' && s.kind !== 'mobile_money') return; // bank payouts are finance-operated; the settlement stays visible in admin
    const claimed = await this.db.one<any>(`UPDATE settlements SET status='processing', attempts=attempts+1, submitted_at=now(), failure_reason=NULL WHERE id=$1 AND status IN ('pending','failed') RETURNING attempts`, [s.id]);
    if (!claimed) return;
    const originator = `${s.id}-${claimed.attempts}`;
    let out;
    try {
      out = await this.pay.provider.payout({ idempotencyKey: originator, amount: Number(s.amount), currency: 'KES', destination: { kind: s.kind, ref: s.ref, name: s.account_name }, remarks: 'FundiLink payout' });
    } catch (e) {
      await this.db.query(`UPDATE settlements SET status='failed', failure_reason=$2 WHERE id=$1`, [s.id, String((e as Error).message).slice(0, 300)]);
      throw e;
    }
    await this.db.query('UPDATE settlements SET provider_ref=$2 WHERE id=$1', [s.id, out.providerRef]);
    if (out.status === 'paid') await this.finalizeSettlement(s.id, out.receipt);
  }

  private async finalizeSettlement(settlementId: string, receipt?: string) {
    const after: After = [];
    await this.db.tx(async (c) => {
      const s = (await c.query(`UPDATE settlements SET status='paid', paid_at=now(), provider_receipt=COALESCE($2,provider_receipt), failure_reason=NULL WHERE id=$1 AND status IN ('processing','pending','failed') RETURNING *`, [settlementId, receipt ?? null])).rows[0];
      if (!s) return; // already finalised: idempotent
      await postLedger(c, `payout:${s.id}`, 'payout', null, [{ account: proAcct(s.professional_id), debit: Number(s.amount) }, { account: PSP, credit: Number(s.amount) }]);
      const items = (await c.query('SELECT booking_id FROM settlement_items WHERE settlement_id=$1', [s.id])).rows;
      for (const it of items) if (it.booking_id) await this.bookings.move(c, it.booking_id, 'settled', 'system', null, {});
      after.push(async () => this.notifier.send(await this.notifier.proUsers(s.professional_id), { template: 'payout_sent', title: 'Payout sent', body: `${kes(s.amount)} is on its way to your M-Pesa${receipt ? ` (ref ${receipt})` : ''}.`, data: { settlementId: s.id } }));
    });
    for (const f of after) await f().catch(() => {});
  }

  private async onPayoutResult(r: B2CResult, timeout: boolean) {
    const s = await this.db.one<any>(`SELECT * FROM settlements WHERE provider_ref=$1 OR id::text = left($1, 36)`, [r.originatorConversationId]);
    if (!s) { this.log.warn(`payout result for unknown settlement ${r.originatorConversationId}`); return; }
    if (timeout) { // not processed in time: keep it 'processing' and flag it, finance decides (never auto-retry: a late success would pay twice)
      await this.db.query(`UPDATE settlements SET failure_reason='Safaricom queue timeout: awaiting result. Verify in the M-Pesa portal before retrying.' WHERE id=$1 AND status='processing'`, [s.id]);
      return;
    }
    if (r.success) { await this.finalizeSettlement(s.id, r.transactionId || undefined); return; }
    await this.db.query(`UPDATE settlements SET status='failed', failure_reason=$2 WHERE id=$1 AND status='processing'`, [s.id, `${r.resultDesc}`.slice(0, 300)]);
    await this.notifier.send(await this.notifier.proUsers(s.professional_id), { template: 'payout_failed', title: 'Payout could not be sent', body: 'Check that your payout M-Pesa number is correct. We will retry automatically.', data: { settlementId: s.id } });
  }

  /** Finance: retry a payout stuck in processing/failed. Uses a fresh attempt number so Safaricom sees a new request. */
  async retrySettlement(u: AuthUser, id: string, ip?: string) {
    const s = await this.db.one<any>('SELECT * FROM settlements WHERE id=$1', [id]);
    if (!s || !['processing', 'failed'].includes(s.status)) throw new BadRequestException('Only stuck or failed payouts can be retried');
    await this.db.query(`UPDATE settlements SET status='failed' WHERE id=$1`, [id]);
    await this.audit.log(u, { action: 'settlement.retry', kind: 'settlement', id, before: { status: s.status }, after: { status: 'failed' }, ip });
    await this.processSettlement(id);
    return { ok: true };
  }

  /* =====================================================================================================
     Direct payment (Model 2): commission comes out of the professional's prepaid wallet
     ===================================================================================================== */
  async chargeDirectCommission(bookingId: string) {
    const after: After = [];
    await this.db.tx(async (c) => {
      const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
      if (!b || b.payment_mode !== 'direct' || b.status !== 'completed' || b.commission_charged_at) return;
      const commission = Number(b.commission) + Number(b.customer_fee);
      await postLedger(c, `direct-commission:${b.id}`, 'direct_commission', b.id, [{ account: walletAccount(b.professional_id), debit: commission }, { account: REVENUE, credit: commission }]);
      await c.query('UPDATE bookings SET commission_charged_at=now() WHERE id=$1', [b.id]);
      await this.bookings.move(c, b.id, 'settlement_pending', 'system', null, {});
      await this.bookings.move(c, b.id, 'settled', 'system', null, {});
      after.push(() => this.walletNudge(b.professional_id, b.reference, commission));
    });
    for (const f of after) await f().catch(() => {});
  }

  private async walletNudge(proId: string, ref: string, commission: number) {
    const s = await this.wallet.settings(), bal = await this.wallet.balance(proId);
    if (bal <= s.minBalance) await this.notifier.send(await this.notifier.proUsers(proId), { template: 'wallet_empty', title: 'Wallet empty: top up to keep taking pay-on-site jobs', body: `${kes(commission)} commission for ${ref} was taken from your wallet. Balance: ${kes(bal)}. In-app paid jobs are unaffected.`, data: { balance: bal }, channels: ['in_app', 'push', 'sms'] });
    else if (bal <= s.lowAlert) await this.notifier.send(await this.notifier.proUsers(proId), { template: 'wallet_low', title: 'Wallet running low', body: `${kes(bal)} left after ${ref}. Top up with M-Pesa to keep receiving pay-on-site jobs.`, data: { balance: bal } });
  }

  /** Finance: credit or debit a wallet by hand (bank-transfer top-ups, goodwill credit, corrections). Always reasoned and audited. */
  async adjustWallet(u: AuthUser, proId: string, amount: number, reason: string, ip?: string) {
    if (!Number.isInteger(amount) || amount === 0) throw new BadRequestException('Amount must be a non-zero whole number of cents');
    const p = await this.db.one('SELECT 1 FROM professional_profiles WHERE id=$1', [proId]);
    if (!p) throw new NotFoundException();
    const key = `wallet-adjust:${randomUUID()}`;
    await this.db.tx(async (c) => {
      const abs = Math.abs(amount);
      await postLedger(c, key, 'wallet_adjustment', null, amount > 0
        ? [{ account: ADJUSTMENTS, debit: abs }, { account: walletAccount(proId), credit: abs }]
        : [{ account: walletAccount(proId), debit: abs }, { account: ADJUSTMENTS, credit: abs }]);
      await this.audit.log(u, { action: 'wallet.adjust', kind: 'professional', id: proId, after: { amount }, reason, ip }, c);
    });
    return { balance: await this.wallet.balance(proId) };
  }

  /* =====================================================================================================
     Refunds (Safaricom Transaction Reversal)
     ===================================================================================================== */

  /** Refund with maker-checker: requester can't approve; large amounts need the finance permission. */
  async requestRefund(u: AuthUser, i: { bookingId: string; amount: number; reason: string }) {
    const b = await this.db.one<any>('SELECT customer_id, professional_id FROM bookings WHERE id=$1', [i.bookingId]);
    if (!b) throw new NotFoundException();
    if (b.customer_id !== u.id && !u.perms.includes('*') && !u.perms.includes('refunds.approve.small')) throw new ForbiddenException();
    const pi = await this.db.one<any>(`SELECT * FROM payment_intents WHERE booking_id=$1 AND purpose='booking' AND status='succeeded' ORDER BY created_at DESC LIMIT 1`, [i.bookingId]);
    if (!pi) throw new BadRequestException('No successful in-app payment on this booking. Pay-on-site jobs are settled between you and the professional.');
    const done = Number((await this.db.one<any>(`SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE payment_intent_id=$1 AND status IN ('requested','approved','processed')`, [pi.id]))!.n);
    if (i.amount <= 0 || i.amount + done > Number(pi.amount)) throw new BadRequestException('Invalid refund amount');
    return this.db.one(`INSERT INTO refunds (booking_id, payment_intent_id, amount, reason, requested_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [i.bookingId, pi.id, i.amount, i.reason, u.id]);
  }

  async approveRefund(u: AuthUser, refundId: string, ip?: string) {
    const r = await this.db.one<any>('SELECT * FROM refunds WHERE id=$1', [refundId]);
    if (!r || !['requested', 'failed'].includes(r.status)) throw new BadRequestException('Refund is not pending');
    if (r.requested_by === u.id) throw new ForbiddenException('You cannot approve your own refund request');
    const threshold = Number((await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='refund.large_threshold_minor'`))?.value ?? 500000);
    const need = Number(r.amount) > threshold ? 'refunds.approve.large' : 'refunds.approve.small';
    if (!u.perms.includes('*') && !u.perms.includes(need)) throw new ForbiddenException(`Requires ${need}`);
    await this.audit.log(u, { action: 'refund.approve', kind: 'refund', id: r.id, before: { status: r.status }, after: { amount: r.amount }, reason: r.reason, ip });
    return this.executeRefund(r.id, u.id);
  }

  /** Cancellation/decline/expiry before the work starts returns the customer's money automatically. */
  async autoRefund(bookingId: string, reason: string) {
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [bookingId]);
    if (!b || b.payment_mode !== 'escrow') return;
    const intents = await this.db.query<any>(
      `SELECT pi.* FROM payment_intents pi WHERE pi.booking_id=$1 AND pi.purpose IN ('booking','addon') AND pi.status='succeeded'
         AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_intent_id=pi.id AND r.status IN ('requested','approved','processed'))`, [bookingId]);
    for (const pi of intents) {
      const r = await this.db.one<any>(`INSERT INTO refunds (booking_id, payment_intent_id, amount, reason, requested_by, system_initiated) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`, [bookingId, pi.id, pi.amount, reason, b.customer_id]);
      await this.executeRefund(r!.id, null).catch((e) => this.log.error(`refund ${r!.id}: ${e}`));
    }
  }

  private async executeRefund(refundId: string, approverId: string | null) {
    const claimed = await this.db.one<any>(`UPDATE refunds SET status='approved', approved_by=COALESCE($2, approved_by), failure_reason=NULL WHERE id=$1 AND status IN ('requested','failed') RETURNING *`, [refundId, approverId]);
    if (!claimed) return { processed: false };
    const pi = await this.db.one<any>('SELECT * FROM payment_intents WHERE id=$1', [claimed.payment_intent_id]);
    try {
      const out = await this.pay.provider.refund({ providerRef: pi.provider_ref, receipt: pi.provider_receipt, amount: Number(claimed.amount), idempotencyKey: `refund:${claimed.id}` });
      await this.db.query('UPDATE refunds SET provider_ref=$2 WHERE id=$1', [claimed.id, out.providerRef]);
      if (out.status === 'processed') await this.finishRefund(claimed.id);
      return { processed: out.status === 'processed', pending: out.status === 'processing' };
    } catch (e) {
      await this.db.query(`UPDATE refunds SET status='failed', failure_reason=$2 WHERE id=$1`, [claimed.id, String((e as Error).message).slice(0, 300)]);
      throw asHttp(e);
    }
  }

  private async finishRefund(refundId: string, receipt?: string) {
    const after: After = [];
    await this.db.tx(async (c) => {
      const r = (await c.query(`UPDATE refunds SET status='processed', provider_receipt=COALESCE($2,provider_receipt) WHERE id=$1 AND status IN ('approved','requested','failed') RETURNING *`, [refundId, receipt ?? null])).rows[0];
      if (!r) return; // idempotent
      const pi = (await c.query('SELECT * FROM payment_intents WHERE id=$1', [r.payment_intent_id])).rows[0];
      const b = r.booking_id ? (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [r.booking_id])).rows[0] : null;
      const amt = Number(r.amount), split = pi.split ?? null;
      let entries: { account: string; debit?: number; credit?: number }[];
      if (split?.unallocated) entries = [{ account: UNALLOCATED, debit: amt }, { account: PSP, credit: amt }];
      else if (split && b) {
        const g = Number(split.gross), revShare = Math.round((amt * Number(split.revenue)) / g), taxShare = Math.round((amt * Number(split.tax)) / g);
        entries = [{ account: proAcct(b.professional_id), debit: amt - revShare - taxShare }, { account: REVENUE, debit: revShare }, { account: TAX, debit: taxShare }, { account: PSP, credit: amt }];
      } else if (b) { // payments made before 'split' existed
        const gross = Number(pi.amount), tax = Number(b.tax), net = Number(b.professional_net), rev = gross - net - tax;
        const revShare = Math.round((amt * rev) / gross), taxShare = Math.round((amt * tax) / gross);
        entries = [{ account: proAcct(b.professional_id), debit: amt - revShare - taxShare }, { account: REVENUE, debit: revShare }, { account: TAX, debit: taxShare }, { account: PSP, credit: amt }];
      } else throw new Error(`Refund ${r.id} has no booking to reverse against`);
      await postLedger(c, `refund:${r.id}`, 'refund', r.booking_id, entries);
      if (b && ['cancelled', 'declined'].includes(b.status)) {
        const paid = Number((await c.query(`SELECT COALESCE(SUM(amount),0) n FROM payment_intents WHERE booking_id=$1 AND status='succeeded'`, [b.id])).rows[0].n);
        const back = Number((await c.query(`SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE booking_id=$1 AND status='processed'`, [b.id])).rows[0].n);
        await this.bookings.move(c, b.id, back >= paid ? 'refunded' : 'partially_refunded', 'system', null, {});
      }
      after.push(() => this.notifier.send(r.requested_by, { template: 'payment_refunded', title: 'Refund sent', body: `${kes(amt)} has been returned to your M-Pesa.`, data: { bookingId: r.booking_id } }));
    });
    for (const f of after) await f().catch(() => {});
  }

  private async onReversalResult(r: B2CResult, timeout: boolean) {
    const refund = await this.db.one<any>(`SELECT * FROM refunds WHERE provider_ref=$1`, [r.originatorConversationId]);
    if (!refund) { this.log.warn(`reversal result for unknown refund ${r.originatorConversationId}`); return; }
    if (timeout) { await this.db.query(`UPDATE refunds SET failure_reason='Safaricom queue timeout: verify in the M-Pesa portal' WHERE id=$1 AND status='approved'`, [refund.id]); return; }
    if (r.success) await this.finishRefund(refund.id, r.transactionId || undefined);
    else await this.db.query(`UPDATE refunds SET status='failed', failure_reason=$2 WHERE id=$1 AND status='approved'`, [refund.id, r.resultDesc.slice(0, 300)]);
  }

  /* =====================================================================================================
     Read models
     ===================================================================================================== */
  async earnings(u: AuthUser) {
    const p = await this.db.one<any>('SELECT id FROM professional_profiles WHERE user_id=$1', [u.id]);
    if (!p) throw new ForbiddenException();
    const [bal, settled, pending, escrow, direct, wallet] = await Promise.all([
      this.db.one<any>(`SELECT COALESCE(SUM(credit)-SUM(debit),0)::bigint AS payable FROM ledger_entries WHERE account=$1`, [proAcct(p.id)]),
      this.db.one<any>(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM settlements WHERE professional_id=$1 AND status='paid'`, [p.id]),
      this.db.one<any>(`SELECT COALESCE(SUM(amount),0)::bigint AS total FROM settlements WHERE professional_id=$1 AND status IN ('pending','processing','failed')`, [p.id]),
      this.db.one<any>(`SELECT COALESCE(SUM(professional_net),0)::bigint AS total FROM bookings WHERE professional_id=$1 AND payment_mode='escrow' AND status IN ('awaiting_acceptance','confirmed','scheduled','en_route','arrived','in_progress','awaiting_completion','disputed')`, [p.id]),
      this.db.one<any>(`SELECT COALESCE(SUM(total),0)::bigint AS total, COUNT(*)::int AS jobs FROM bookings WHERE professional_id=$1 AND payment_mode='direct' AND status IN ('completed','settlement_pending','settled') AND completed_at >= date_trunc('month', now())`, [p.id]),
      this.wallet.summary(p.id),
    ]);
    return {
      payable: bal!.payable, settled: settled!.total, pendingSettlement: pending!.total, inEscrow: escrow!.total,
      directThisMonth: direct!.total, directJobsThisMonth: direct!.jobs, wallet,
    };
  }

  async walletView(u: AuthUser) {
    const p = await this.db.one<any>('SELECT id FROM professional_profiles WHERE user_id=$1', [u.id]);
    if (!p) throw new ForbiddenException('Only professionals have a wallet');
    const [summary, statement, topups] = await Promise.all([
      this.wallet.summary(p.id), this.wallet.statement(p.id, 50),
      this.db.query<any>(`SELECT * FROM payment_intents WHERE purpose='wallet_topup' AND subject_id=$1 ORDER BY created_at DESC LIMIT 10`, [p.id]),
    ]);
    return { ...summary, transactions: statement, topups: topups.map((t) => this.view(t)) };
  }
}

const Phone = z.string().min(9).max(20).optional();

@Controller()
export class PaymentController {
  constructor(private s: PaymentService) {}

  @Public() @Get('payments/config')
  config() { return this.s.config(); }

  @Post('payments')
  pay(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.startPayment(u, parse(z.object({ bookingId: z.string().uuid(), method: z.enum(['mpesa', 'card', 'bank']), phone: Phone, idempotencyKey: z.string().min(16) }), b));
  }

  @Post('payments/addon')
  payAddon(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.startAddonPayment(u, parse(z.object({ revisionId: z.string().uuid(), method: z.enum(['mpesa', 'card', 'bank']).optional(), phone: Phone, idempotencyKey: z.string().min(16) }), b));
  }

  @Get('payments/:id')
  intent(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.getIntent(u, id); }

  @Get('wallet') wallet(@CurrentUser() u: AuthUser) { return this.s.walletView(u); }

  @Post('wallet/topup')
  topup(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.startTopup(u, parse(z.object({ amount: z.number().int().positive(), method: z.enum(['mpesa', 'card', 'bank']).optional(), phone: Phone, idempotencyKey: z.string().min(16) }), b));
  }

  @Public() @Post('webhooks/payments') @HttpCode(200)
  webhook(@Req() req: any, @Headers('x-signature') sig: string) {
    return this.s.handleWebhook(req.rawBody!.toString('utf8'), sig);
  }

  /** Safaricom callbacks (STK result, B2C result/timeout, reversal result/timeout). The URL itself carries the secret. */
  @Public() @Post('webhooks/pay/:secret/:kind') @HttpCode(200)
  mpesa(@Param('secret') secret: string, @Param('kind') kind: string, @Body() body: unknown, @Req() req: any) {
    return this.s.handleMpesa(secret, kind, body, req.ip);
  }

  @Post('refunds')
  requestRefund(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.requestRefund(u, parse(z.object({ bookingId: z.string().uuid(), amount: z.number().int().positive(), reason: z.string().min(5) }), b));
  }

  @Perm('refunds.approve.small') @Post('admin/refunds/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: any) { return this.s.approveRefund(u, id, req.ip); }

  @Perm('settlements.approve') @Post('admin/settlements/:id/retry')
  retry(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: any) { return this.s.retrySettlement(u, id, req.ip); }

  @Perm('settlements.approve') @Post('admin/wallets/:proId/adjust')
  adjust(@CurrentUser() u: AuthUser, @Param('proId') proId: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ amount: z.number().int(), reason: z.string().min(5) }), b);
    return this.s.adjustWallet(u, proId, i.amount, i.reason, req.ip);
  }

  @Get('earnings') earnings(@CurrentUser() u: AuthUser) { return this.s.earnings(u); }
}
