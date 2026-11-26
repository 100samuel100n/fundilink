import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Injectable, NotFoundException, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Audit, Perm, Public, parse, postLedger, sha256 } from '../common/core.ts';
import { Email, Payments, Push, Sms } from '../providers/providers.ts';
import { MaskedCalls, WhatsApp } from '../providers/extras.ts';
import { BookingService } from './bookings.ts';

const PSP = 'PSP_HOLDING';
const ref = (p: string) => `${p}-${String(randomInt(0, 1e8)).padStart(8, '0')}`;
const clamp = (n: unknown, max = 200) => Math.min(Math.max(Number(n) || 50, 1), max);

/* ======================================================================================================
   Notification fan-out: honours per-user channel preferences; WhatsApp is strictly opt-in.
   ====================================================================================================== */
@Injectable()
export class NotifyService {
  constructor(private db: Db, private sms: Sms, private email: Email, private push: Push, private wa: WhatsApp) {}

  async deliverPending(limit = 100) {
    const rows = await this.db.query<any>(`SELECT n.*, u.phone, u.email, u.whatsapp_opt_in FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.delivered_at IS NULL ORDER BY n.created_at LIMIT $1`, [limit]);
    for (const n of rows) {
      const off = new Set((await this.db.query<any>(`SELECT channel FROM notification_preferences WHERE user_id=$1 AND template=$2 AND NOT enabled`, [n.user_id, n.template])).map((r) => r.channel));
      const essential = ['arrival_pin', 'payout_changed', 'request_expired', 'revision_request', 'addon_paid', 'payment_received', 'payout_sent', 'payout_failed', 'payment_refunded', 'wallet_empty', 'direct_payment_recorded'].includes(n.template); // safety/money alerts can't be muted
      const want = (ch: string) => (n.channels as string[]).includes(ch) && (essential || !off.has(ch));
      try {
        if (want('sms') && n.phone) await this.sms.send(n.phone, `${n.title}: ${n.body}`.slice(0, 300));
        if (want('email') && n.email) await this.email.send(n.email, n.title ?? 'FundiLink', `<p>${String(n.body ?? '').replace(/</g, '&lt;')}</p>`);
        if (want('push')) {
          const t = (await this.db.query<any>('SELECT token FROM push_tokens WHERE user_id=$1', [n.user_id])).map((r) => r.token);
          if (t.length) await this.push.send(t, n.title ?? 'FundiLink', n.body ?? '', { template: n.template, ...(n.data ?? {}) });
        }
        if ((n.channels as string[]).includes('whatsapp') && n.whatsapp_opt_in && n.phone && !off.has('whatsapp')) await this.wa.send(n.phone, 'fundilink_update', [n.title ?? '', n.body ?? '']);
      } catch { /* leave undelivered for retry only on transport errors */ continue; }
      await this.db.query('UPDATE notifications SET delivered_at=now() WHERE id=$1', [n.id]);
    }
    return rows.length;
  }

  /** Daily: remind professionals whose credentials expire within 30 days; expire lapsed ones. */
  async verificationExpiry() {
    await this.db.query(`UPDATE professional_verifications SET state='expired' WHERE state='approved' AND expires_at < now()`);
    await this.db.query(`INSERT INTO notifications (user_id, template, title, body, channels)
      SELECT p.user_id,'credential_expiring','A credential is expiring soon','Upload a renewed document to keep your verified badge.','{in_app,push,email}'
      FROM professional_verifications v JOIN professional_profiles p ON p.id=v.professional_id
      WHERE v.state='approved' AND v.expires_at BETWEEN now() AND now()+interval '30 days' AND v.expiry_notified_at IS NULL`);
    await this.db.query(`UPDATE professional_verifications SET expiry_notified_at=now() WHERE state='approved' AND expires_at BETWEEN now() AND now()+interval '30 days' AND expiry_notified_at IS NULL`);
  }

  /** Loyalty: 1 point per KSh 100 on completed bookings; referral reward once the referred user completes a first booking. Idempotent via UNIQUE. */
  async awardLoyalty() {
    const per = Number((await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='loyalty.points_per_kes100'`))?.value ?? 1);
    await this.db.query(`INSERT INTO loyalty_entries (user_id, points, reason, booking_id)
      SELECT customer_id, GREATEST(1, (total/10000)::int * $1), 'booking_completed', id FROM bookings WHERE status IN ('completed','settlement_pending','settled')
      ON CONFLICT DO NOTHING`, [per]);
    const ref = await this.db.query<any>(`SELECT r.id, r.referrer_id, r.referred_id FROM referrals r WHERE r.qualified_at IS NULL AND EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id=r.referred_id AND b.status IN ('completed','settlement_pending','settled'))`);
    for (const r of ref) {
      await this.db.tx(async (c) => {
        await c.query('UPDATE referrals SET qualified_at=now(), reward_paid_at=now() WHERE id=$1', [r.id]);
        for (const [uid, why] of [[r.referrer_id, 'referral_reward'], [r.referred_id, 'referral_welcome']]) await c.query(`INSERT INTO loyalty_entries (user_id, points, reason) VALUES ($1,200,$2) ON CONFLICT DO NOTHING`, [uid, why + ':' + r.id]);
      });
    }
  }
}

/* ======================================================================================================
   Public content: CMS pages, FAQs, testimonials, enabled counties.
   ====================================================================================================== */
@Controller()
export class PublicContentController {
  constructor(private db: Db) {}
  @Public() @Get('content') list(@Query('kind') kind?: string) { return this.db.query(`SELECT slug, kind, title, body, meta FROM content_pages WHERE published AND ($1::text IS NULL OR kind=$1) ORDER BY id`, [kind ?? null]); }
  @Public() @Get('content/:slug') async one(@Param('slug') slug: string) { const r = await this.db.one(`SELECT slug, kind, title, body, meta FROM content_pages WHERE slug=$1 AND published`, [slug]); if (!r) throw new NotFoundException(); return r; }
  @Public() @Get('coverage') coverage(@Query('country') country = 'KE') { return this.db.query(`SELECT county, town, enabled, ST_Y(centre::geometry) lat, ST_X(centre::geometry) lng FROM service_locations WHERE country_code=$1 ORDER BY county, town NULLS FIRST`, [country]); }
  @Public() @Get('subscription/plans') plans() { return this.db.query('SELECT code, name, monthly_amount, features FROM subscription_plans ORDER BY monthly_amount'); }
  @Public() @Get('promotions/public') promos() { return this.db.query(`SELECT code, kind, value, ends_at FROM promotional_campaigns WHERE active AND (ends_at IS NULL OR ends_at>now()) AND code LIKE 'PUB-%'`); }
}

/* ======================================================================================================
   Support desk (customer + professional side).
   ====================================================================================================== */
@Controller('support')
export class SupportController {
  constructor(private db: Db) {}
  @Post('tickets') async create(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ subject: z.string().min(3).max(160), body: z.string().min(5), bookingId: z.string().uuid().optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), fromAi: z.boolean().default(false) }), b);
    return this.db.tx(async (c) => {
      const t = (await c.query(`INSERT INTO support_tickets (reference, user_id, booking_id, subject, priority, escalated_from_ai) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ref('SUP'), u.id, i.bookingId ?? null, i.subject, i.priority, i.fromAi])).rows[0];
      await c.query('INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1,$2,$3)', [t.id, u.id, i.body]);
      return t;
    });
  }
  @Get('tickets') mine(@CurrentUser() u: AuthUser) { return this.db.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100', [u.id]); }
  @Get('tickets/:id') async one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const t = await this.db.one<any>('SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2', [id, u.id]);
    if (!t) throw new NotFoundException();
    return { ...t, messages: await this.db.query('SELECT id, staff, body, created_at FROM support_messages WHERE ticket_id=$1 ORDER BY id', [id]) };
  }
  @Post('tickets/:id/messages') async reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ body: z.string().min(1).max(4000) }), b);
    const t = await this.db.one<any>('SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2', [id, u.id]);
    if (!t) throw new NotFoundException();
    await this.db.query('INSERT INTO support_messages (ticket_id, author_id, body) VALUES ($1,$2,$3)', [id, u.id, i.body]);
    await this.db.query(`UPDATE support_tickets SET status='open', updated_at=now() WHERE id=$1`, [id]);
    return { ok: true };
  }
}

/* ======================================================================================================
   Subscriptions + activation fee (monetisation lifecycle: free -> activation -> optional plans).
   ====================================================================================================== */
@Controller()
export class MonetisationController {
  constructor(private db: Db, private pay: Payments) {}

  private async myPro(u: AuthUser) { const p = await this.db.one<any>('SELECT * FROM professional_profiles WHERE user_id=$1', [u.id]); if (!p) throw new ForbiddenException('Professional account required'); return p; }

  @Get('subscription/mine') async mine(@CurrentUser() u: AuthUser) {
    const p = await this.myPro(u);
    return (await this.db.one(`SELECT s.*, sp.name, sp.monthly_amount, sp.features FROM subscriptions s JOIN subscription_plans sp ON sp.code=s.plan WHERE s.professional_id=$1 AND s.status IN ('active','past_due') ORDER BY s.current_period_end DESC LIMIT 1`, [p.id]))
      ?? { plan: 'free', status: 'active', name: 'Free', monthly_amount: 0 };
  }

  /** Subscriptions buy business tools, never ranking or access to jobs. */
  @Post('subscription/subscribe') async subscribe(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ plan: z.enum(['professional_plus', 'business_pro']), method: z.enum(['mpesa', 'card', 'bank']), phone: z.string().optional(), idempotencyKey: z.string().min(16) }), b);
    const dup = await this.db.one('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]);
    if (dup) return dup;
    const p = await this.myPro(u);
    const plan = await this.db.one<any>('SELECT * FROM subscription_plans WHERE code=$1', [i.plan]);
    if (!plan) throw new BadRequestException('Unknown plan');
    return this.db.tx(async (c) => {
      const sub = (await c.query(`INSERT INTO subscriptions (professional_id, plan, status, current_period_end) VALUES ($1,$2,'past_due', now()) RETURNING *`, [p.id, i.plan])).rows[0];
      const pi = (await c.query(`INSERT INTO payment_intents (user_id, idempotency_key, provider, method, amount, status, purpose, subject_id) VALUES ($1,$2,$3,$4,$5,'pending','subscription',$6) RETURNING *`, [u.id, i.idempotencyKey, this.pay.provider.name, i.method, plan.monthly_amount, sub.id])).rows[0];
      await c.query(`INSERT INTO subscription_invoices (subscription_id, amount, period_start, period_end, payment_intent_id) VALUES ($1,$2,now(), now()+interval '1 month',$3)`, [sub.id, plan.monthly_amount, pi.id]);
      const r = await this.pay.provider.charge({ intentId: pi.id, idempotencyKey: i.idempotencyKey, amount: Number(plan.monthly_amount), currency: 'KES', method: i.method, phone: i.phone, reference: `SUB-${sub.id.slice(0, 8)}` });
      await c.query('UPDATE payment_intents SET provider_ref=$2 WHERE id=$1', [pi.id, r.providerRef]);
      return { ...pi, provider_ref: r.providerRef };
    });
  }
  @Post('subscription/cancel') async cancel(@CurrentUser() u: AuthUser) {
    const p = await this.myPro(u);
    await this.db.query(`UPDATE subscriptions SET status='cancelled' WHERE professional_id=$1 AND status IN ('active','past_due')`, [p.id]);
    return { ok: true, note: 'Your plan stays usable until the end of the paid period; your profile and bookings are untouched.' };
  }

  /** Activation fee: explained up front, paid once, never buys ranking, jobs, ratings or verification. */
  @Get('professional/activation') async activation(@CurrentUser() u: AuthUser) {
    const p = await this.myPro(u);
    const rule = await this.db.one<any>(`SELECT * FROM activation_fee_rules WHERE country_code=$1 ORDER BY id DESC LIMIT 1`, [p.country_code]);
    const paid = await this.db.one('SELECT * FROM activation_payments WHERE professional_id=$1', [p.id]);
    const until = (await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='founding.until'`))?.value;
    const founding = !!rule?.founding_waiver && !!until && new Date(p.created_at) < new Date(String(until).replace(/"/g, ''));
    const due = !!rule?.enabled && !paid && !founding;
    return { enabled: !!rule?.enabled, amount: Number(rule?.amount ?? 0), due, founding, paid: !!paid, refundableDays: rule?.refundable_days ?? 7,
      terms: 'One-time fee. No recurring listing charge. It does not affect your ranking, ratings, verification or the jobs you receive.' };
  }
  @Post('professional/activation/pay') async payActivation(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ method: z.enum(['mpesa', 'card', 'bank']), phone: z.string().optional(), idempotencyKey: z.string().min(16) }), b);
    const dup = await this.db.one('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]);
    if (dup) return dup;
    const a = await this.activation(u); const p = await this.myPro(u);
    if (!a.due) throw new BadRequestException('No activation fee is due on this account');
    const pi = await this.db.one<any>(`INSERT INTO payment_intents (user_id, idempotency_key, provider, method, amount, status, purpose, subject_id) VALUES ($1,$2,$3,$4,$5,'pending','activation',$6) RETURNING *`, [u.id, i.idempotencyKey, this.pay.provider.name, i.method, a.amount, p.id]);
    const r = await this.pay.provider.charge({ intentId: pi.id, idempotencyKey: i.idempotencyKey, amount: a.amount, currency: 'KES', method: i.method, phone: i.phone, reference: `ACT-${p.id.slice(0, 8)}` });
    await this.db.query('UPDATE payment_intents SET provider_ref=$2 WHERE id=$1', [pi.id, r.providerRef]);
    return { ...pi, provider_ref: r.providerRef };
  }
}

/* ======================================================================================================
   Warranties, digital contracts, loyalty & promo validation.
   ====================================================================================================== */
@Controller()
export class TrustExtrasController {
  constructor(private db: Db, private bookings: BookingService, private audit: Audit) {}

  @Post('warranty/claims') async claim(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ bookingId: z.string().uuid(), description: z.string().min(10), evidenceKeys: z.array(z.string()).default([]) }), b);
    const bk = await this.db.one<any>(`SELECT b.*, COALESCE(b.warranty_days, ps.warranty_days) days FROM bookings b LEFT JOIN professional_services ps ON ps.id=b.professional_service_id WHERE b.id=$1`, [i.bookingId]);
    if (!bk || bk.customer_id !== u.id) throw new ForbiddenException();
    if (!['completed', 'settlement_pending', 'settled'].includes(bk.status)) throw new BadRequestException('Warranty applies to completed work');
    if (!bk.days) throw new BadRequestException('This service did not include a warranty');
    if (Date.now() > new Date(bk.completed_at).getTime() + bk.days * 86_400_000) throw new BadRequestException(`The ${bk.days}-day warranty has ended`);
    return this.db.one(`INSERT INTO warranty_claims (booking_id, customer_id, professional_id, description, evidence_keys) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [bk.id, u.id, bk.professional_id, i.description, i.evidenceKeys]);
  }
  @Get('warranty/claims') async claims(@CurrentUser() u: AuthUser, @Query('as') as = 'customer') {
    if (as === 'professional') {
      const p = await this.db.one<any>('SELECT id FROM professional_profiles WHERE user_id=$1', [u.id]); if (!p) throw new ForbiddenException();
      return this.db.query(`SELECT w.*, b.reference FROM warranty_claims w JOIN bookings b ON b.id=w.booking_id WHERE w.professional_id=$1 ORDER BY w.created_at DESC`, [p.id]);
    }
    return this.db.query(`SELECT w.*, b.reference FROM warranty_claims w JOIN bookings b ON b.id=w.booking_id WHERE w.customer_id=$1 ORDER BY w.created_at DESC`, [u.id]);
  }
  @Post('warranty/claims/:id/respond') async respond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ decision: z.enum(['accepted', 'declined', 'resolved']), response: z.string().min(3) }), b);
    const w = await this.db.one<any>(`SELECT w.* FROM warranty_claims w JOIN professional_profiles p ON p.id=w.professional_id WHERE w.id=$1 AND p.user_id=$2`, [id, u.id]);
    if (!w) throw new ForbiddenException();
    await this.db.query(`UPDATE warranty_claims SET status=$2, professional_response=$3, decided_at=now() WHERE id=$1`, [id, i.decision, i.response]);
    return { ok: true };
  }
  @Post('warranty/claims/:id/escalate') async escalate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const w = await this.db.one<any>('SELECT * FROM warranty_claims WHERE id=$1 AND customer_id=$2', [id, u.id]); if (!w) throw new ForbiddenException();
    await this.db.query(`UPDATE warranty_claims SET status='escalated' WHERE id=$1`, [id]);
    await this.db.query(`INSERT INTO disputes (booking_id, opened_by, reason, resolution_due_at) VALUES ($1,$2,'Warranty claim escalated', now()+interval '7 days')`, [w.booking_id, u.id]).catch(() => undefined);
    return { ok: true };
  }

  /* ---- digital contracts: acceptance is hashed, timestamped and attributable ---- */
  @Get('contracts/:id') async contract(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.db.one<any>(`SELECT c.*, pr.customer_id, p.user_id pro_user FROM contracts c LEFT JOIN projects pr ON pr.id=c.project_id LEFT JOIN bookings b ON b.id=c.booking_id LEFT JOIN professional_profiles p ON p.id=COALESCE(pr.professional_id,b.professional_id) WHERE c.id=$1`, [id]);
    if (!c || ![c.customer_id, c.pro_user].includes(u.id)) throw new NotFoundException();
    return { ...c, acceptances: await this.db.query('SELECT party, accepted_at FROM contract_acceptances WHERE contract_id=$1', [id]) };
  }
  @Post('contracts/:id/accept') async accept(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: any) {
    const c: any = await this.contract(u, id);
    const party = c.customer_id === u.id ? 'customer' : 'professional';
    await this.db.tx(async (t) => {
      await t.query(`INSERT INTO contract_acceptances (contract_id, user_id, party, ip, device, body_sha256) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [id, u.id, party, req.ip ?? null, req.headers['user-agent'] ?? null, await sha256(c.body + (c.warranty_terms ?? ''))]);
      await t.query(`UPDATE contracts SET ${party}_accepted_at=now() WHERE id=$1`, [id]);
    });
    return { ok: true };
  }

  /* ---- loyalty & promo ---- */
  @Get('loyalty') async loyalty(@CurrentUser() u: AuthUser) {
    const [t] = await this.db.query(`SELECT COALESCE(sum(points),0)::int points FROM loyalty_entries WHERE user_id=$1`, [u.id]);
    const cp = await this.db.one<any>('SELECT referral_code FROM customer_profiles WHERE user_id=$1', [u.id]);
    return { ...t, referralCode: cp?.referral_code ?? null, entries: await this.db.query('SELECT points, reason, created_at FROM loyalty_entries WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]) };
  }
  @Post('loyalty/redeem') async redeem(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ points: z.number().int().min(100).multipleOf(100) }), b);
    return this.db.tx(async (c) => {
      const bal = Number((await c.query('SELECT COALESCE(sum(points),0) n FROM loyalty_entries WHERE user_id=$1', [u.id])).rows[0].n);
      if (bal < i.points) throw new BadRequestException('Not enough points');
      const code = `LOY-${ref('').slice(1)}`; const value = (i.points / 100) * 5000; // 100 points = KSh 50 (minor units)
      await c.query(`INSERT INTO promotional_campaigns (code, kind, value, max_redemptions, per_user_limit, ends_at) VALUES ($1,'fixed',$2,1,1, now()+interval '90 days')`, [code, value]);
      await c.query(`INSERT INTO loyalty_entries (user_id, points, reason) VALUES ($1,$2,$3)`, [u.id, -i.points, `redeemed:${code}`]);
      return { code, value, expiresInDays: 90 };
    });
  }
  @Post('promotions/validate') async validate(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ code: z.string().min(3), subtotal: z.number().int().positive(), platformMargin: z.number().int().nonnegative().default(1_000_000) }), b);
    return this.bookings.coupon(u.id, i.code, i.subtotal, i.platformMargin);
  }
}

/* ======================================================================================================
   Team management for business accounts + masked calls.
   ====================================================================================================== */
@Controller()
export class TeamController {
  constructor(private db: Db, private audit: Audit, private calls: MaskedCalls, private sms: Sms) {}

  private async ownBusiness(u: AuthUser) {
    const p = await this.db.one<any>(`SELECT p.* FROM professional_profiles p WHERE p.user_id=$1 AND p.account_type='business'
       UNION SELECT p.* FROM professional_profiles p JOIN business_members m ON m.business_id=p.id WHERE m.user_id=$1 AND m.role IN ('admin','operations') LIMIT 1`, [u.id]);
    if (!p) throw new ForbiddenException('Business account required');
    return p;
  }
  @Get('team') async team(@CurrentUser() u: AuthUser) {
    const p = await this.ownBusiness(u);
    return this.db.query(`SELECT m.user_id, m.role, us.full_name, us.phone,
        (SELECT count(*) FROM bookings b WHERE b.assigned_user_id=m.user_id AND b.status IN ('completed','settled','settlement_pending'))::int completed,
        (SELECT round(avg(r.overall)::numeric,2) FROM reviews r JOIN bookings b ON b.id=r.booking_id WHERE b.assigned_user_id=m.user_id) rating
      FROM business_members m JOIN users us ON us.id=m.user_id WHERE m.business_id=$1 ORDER BY m.role`, [p.id]);
  }
  @Post('team/members') async add(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ phone: z.string().min(7), role: z.enum(['admin', 'operations', 'support', 'technician']) }), b);
    const p = await this.ownBusiness(u);
    const target = await this.db.one<any>('SELECT id FROM users WHERE phone=$1', [i.phone]);
    if (!target) { await this.sms.send(i.phone, `${p.display_name} invited you to join their team on FundiLink. Create an account with this number to accept.`); return { invited: true }; }
    await this.db.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (business_id,user_id) DO UPDATE SET role=EXCLUDED.role`, [p.id, target.id, i.role]);
    await this.audit.log(u, { action: 'team.add', kind: 'business', id: p.id, after: { user: target.id, role: i.role } });
    return { added: true };
  }
  @Post('team/members/:userId/remove') async remove(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    const p = await this.ownBusiness(u);
    await this.db.query('DELETE FROM business_members WHERE business_id=$1 AND user_id=$2', [p.id, userId]);
    await this.audit.log(u, { action: 'team.remove', kind: 'business', id: p.id, after: { user: userId } });
    return { ok: true };
  }
  /** Assign a job to one technician; the booking's shared calendar slot is unchanged. */
  @Post('bookings/:id/assign') async assign(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ technicianId: z.string().uuid() }), b);
    const p = await this.ownBusiness(u);
    const bk = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1 AND professional_id=$2', [id, p.id]); if (!bk) throw new NotFoundException();
    const ok = await this.db.one(`SELECT 1 FROM business_members WHERE business_id=$1 AND user_id=$2 AND role='technician'`, [p.id, i.technicianId]); if (!ok) throw new BadRequestException('Not a technician on this team');
    await this.db.tx(async (c) => {
      await c.query('UPDATE booking_assignments SET active=false WHERE booking_id=$1 AND active', [id]);
      await c.query('INSERT INTO booking_assignments (booking_id, technician_id, assigned_by) VALUES ($1,$2,$3)', [id, i.technicianId, u.id]);
      await c.query('UPDATE bookings SET assigned_user_id=$2 WHERE id=$1', [id, i.technicianId]);
      await c.query(`INSERT INTO notifications (user_id, template, title, body, data, channels) VALUES ($1,'job_assigned','New job assigned',$2,$3,'{in_app,push,sms}')`, [i.technicianId, `Booking ${bk.reference} is yours.`, JSON.stringify({ bookingId: id })]);
    });
    return { ok: true };
  }

  /** Masked call: only while a booking is live; numbers are never returned to the client. */
  @Post('bookings/:id/call') async call(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.db.one<any>(`SELECT b.customer_id, b.status, p.user_id pro_user, ua.id tech FROM bookings b JOIN professional_profiles p ON p.id=b.professional_id LEFT JOIN users ua ON ua.id=b.assigned_user_id WHERE b.id=$1`, [id]);
    if (!b) throw new NotFoundException();
    if (!['confirmed', 'scheduled', 'en_route', 'arrived', 'in_progress', 'awaiting_completion'].includes(b.status)) throw new BadRequestException('Calls are available while a booking is active');
    const other = u.id === b.customer_id ? (b.tech ?? b.pro_user) : u.id === b.pro_user || u.id === b.tech ? b.customer_id : null;
    if (!other) throw new ForbiddenException();
    const [me, them] = await Promise.all([this.db.one<any>('SELECT phone FROM users WHERE id=$1', [u.id]), this.db.one<any>('SELECT phone FROM users WHERE id=$1', [other])]);
    if (!me?.phone || !them?.phone) throw new BadRequestException('A phone number is missing on one account');
    const s = await this.db.one<any>('INSERT INTO call_sessions (booking_id, caller_id, callee_id) VALUES ($1,$2,$3) RETURNING id', [id, u.id, other]);
    const r = await this.calls.bridge({ callerPhone: me.phone, calleePhone: them.phone, sessionId: s.id });
    await this.db.query('UPDATE call_sessions SET provider_ref=$2 WHERE id=$1', [s.id, r.providerRef]);
    return { ok: true, message: 'We are calling you now and will connect you. Your number stays private.' };
  }
}

/* ======================================================================================================
   Equipment rental marketplace (separate contract, deposit, eligibility).
   ====================================================================================================== */
@Controller('equipment')
export class EquipmentController {
  constructor(private db: Db, private pay: Payments, private audit: Audit) {}
  @Public() @Get() list(@Query('q') q?: string, @Query('category') category?: string, @Query('lat') lat?: string, @Query('lng') lng?: string, @Query('km') km = '25') {
    return this.db.query(`SELECT e.id, e.name, e.category, e.description, e.daily_rate, e.deposit, e.eligibility_notes, e.insurance_required, p.display_name owner, p.slug owner_slug,
        CASE WHEN $3::float IS NULL THEN NULL ELSE round((ST_Distance(e.location, ST_SetSRID(ST_MakePoint($4,$3),4326)::geography)/1000)::numeric,1) END distance_km
      FROM equipment_listings e JOIN professional_profiles p ON p.id=e.professional_id
      WHERE e.active AND p.status='active' AND ($1::text IS NULL OR e.name ILIKE '%'||$1||'%') AND ($2::text IS NULL OR e.category=$2)
        AND ($3::float IS NULL OR ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($4,$3),4326)::geography, $5*1000))
      ORDER BY distance_km NULLS LAST, e.name LIMIT 60`, [q ?? null, category ?? null, lat ? Number(lat) : null, lng ? Number(lng) : null, Number(km)]);
  }
  private async myPro(u: AuthUser) { const p = await this.db.one<any>(`SELECT id FROM professional_profiles WHERE user_id=$1 AND status='active'`, [u.id]); if (!p) throw new ForbiddenException('Only active, verified professionals can list equipment'); return p; }
  @Post() async create(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ name: z.string().min(2), category: z.string().min(2), description: z.string().optional(), dailyRate: z.number().int().nonnegative(), deposit: z.number().int().nonnegative(), eligibilityNotes: z.string().optional(), insuranceRequired: z.boolean().default(false), lat: z.number().optional(), lng: z.number().optional() }), b);
    const p = await this.myPro(u);
    return this.db.one(`INSERT INTO equipment_listings (professional_id, name, category, description, daily_rate, deposit, eligibility_notes, insurance_required, location)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $9::float IS NULL THEN (SELECT base_location FROM professional_profiles WHERE id=$1) ELSE ST_SetSRID(ST_MakePoint($10,$9),4326)::geography END) RETURNING *`,
      [p.id, i.name, i.category, i.description ?? null, i.dailyRate, i.deposit, i.eligibilityNotes ?? null, i.insuranceRequired, i.lat ?? null, i.lng ?? null]);
  }
  @Get('mine') async mine(@CurrentUser() u: AuthUser) {
    const p = await this.myPro(u);
    return { listings: await this.db.query('SELECT * FROM equipment_listings WHERE professional_id=$1 ORDER BY created_at DESC', [p.id]),
      incoming: await this.db.query(`SELECT r.*, e.name, us.full_name renter FROM equipment_rentals r JOIN equipment_listings e ON e.id=r.listing_id JOIN users us ON us.id=r.renter_id WHERE e.professional_id=$1 ORDER BY r.created_at DESC`, [p.id]) };
  }
  @Get('rentals') rentals(@CurrentUser() u: AuthUser) { return this.db.query(`SELECT r.*, e.name FROM equipment_rentals r JOIN equipment_listings e ON e.id=r.listing_id WHERE r.renter_id=$1 ORDER BY r.created_at DESC`, [u.id]); }
  @Post(':id/toggle') async toggle(@CurrentUser() u: AuthUser, @Param('id') id: string) { const p = await this.myPro(u); await this.db.query('UPDATE equipment_listings SET active = NOT active WHERE id=$1 AND professional_id=$2', [id, p.id]); return { ok: true }; }

  @Post(':id/rent') async rent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ from: z.string().date(), to: z.string().date(), acceptTerms: z.literal(true) }), b);
    const e = await this.db.one<any>('SELECT * FROM equipment_listings WHERE id=$1 AND active', [id]); if (!e) throw new NotFoundException();
    const days = Math.max(1, Math.round((+new Date(i.to) - +new Date(i.from)) / 86_400_000) + 1);
    if (new Date(i.to) < new Date(i.from)) throw new BadRequestException('End date is before start date');
    return this.db.one(`INSERT INTO equipment_rentals (listing_id, renter_id, period, rate, deposit, contract_accepted_at) VALUES ($1,$2,daterange($3::date,($4::date + 1)),$5,$6,now()) RETURNING *`,
      [id, u.id, i.from, i.to, Number(e.daily_rate) * days, e.deposit]);
  }
  /** Owner approves; the DB exclusion constraint blocks overlapping approved/active rentals. */
  @Post('rentals/:rid/decide') async decide(@CurrentUser() u: AuthUser, @Param('rid') rid: string, @Body() b: unknown) {
    const i = parse(z.object({ approve: z.boolean() }), b);
    const p = await this.myPro(u);
    const r = await this.db.one<any>(`SELECT r.* FROM equipment_rentals r JOIN equipment_listings e ON e.id=r.listing_id WHERE r.id=$1 AND e.professional_id=$2 AND r.status='requested'`, [rid, p.id]); if (!r) throw new NotFoundException();
    await this.db.tx((c) => c.query('UPDATE equipment_rentals SET status=$2 WHERE id=$1', [rid, i.approve ? 'approved' : 'declined']));
    return { ok: true, next: i.approve ? 'Renter will be asked to pay the refundable deposit.' : 'Declined.' };
  }
  @Post('rentals/:rid/deposit') async deposit(@CurrentUser() u: AuthUser, @Param('rid') rid: string, @Body() b: unknown) {
    const i = parse(z.object({ method: z.enum(['mpesa', 'card', 'bank']), phone: z.string().optional(), idempotencyKey: z.string().min(16) }), b);
    const dup = await this.db.one('SELECT * FROM payment_intents WHERE idempotency_key=$1', [i.idempotencyKey]); if (dup) return dup;
    const r = await this.db.one<any>(`SELECT * FROM equipment_rentals WHERE id=$1 AND renter_id=$2 AND status='approved'`, [rid, u.id]); if (!r) throw new NotFoundException();
    const amount = Number(r.deposit) + Number(r.rate);
    const pi = await this.db.one<any>(`INSERT INTO payment_intents (user_id, idempotency_key, provider, method, amount, status, purpose, subject_id) VALUES ($1,$2,$3,$4,$5,'pending','equipment_deposit',$6) RETURNING *`, [u.id, i.idempotencyKey, this.pay.provider.name, i.method, amount, rid]);
    const c = await this.pay.provider.charge({ intentId: pi.id, idempotencyKey: i.idempotencyKey, amount, currency: 'KES', method: i.method, phone: i.phone, reference: `EQ-${rid.slice(0, 8)}` });
    await this.db.query('UPDATE payment_intents SET provider_ref=$2 WHERE id=$1', [pi.id, c.providerRef]);
    return { ...pi, provider_ref: c.providerRef };
  }
  /** Owner confirms the return in good condition: deposit goes back to the renter. Damage claims go through disputes. */
  @Post('rentals/:rid/return') async ret(@CurrentUser() u: AuthUser, @Param('rid') rid: string) {
    const p = await this.myPro(u);
    const r = await this.db.one<any>(`SELECT r.*, pi.provider_ref, pi.provider_receipt, pi.id pi_id FROM equipment_rentals r JOIN equipment_listings e ON e.id=r.listing_id LEFT JOIN payment_intents pi ON pi.subject_id=r.id AND pi.purpose='equipment_deposit' AND pi.status='succeeded' WHERE r.id=$1 AND e.professional_id=$2 AND r.status='active'`, [rid, p.id]);
    if (!r) throw new NotFoundException();
    // M-Pesa reversals finish asynchronously; the deposit is released in the ledger now and finance sees any failed reversal in the refunds log.
    await this.pay.provider.refund({ providerRef: r.provider_ref, receipt: r.provider_receipt, amount: Number(r.deposit), idempotencyKey: `deposit-refund:${rid}` });
    await this.db.tx(async (c) => {
      await postLedger(c, `deposit-return:${rid}`, 'equipment_deposit_return', null, [{ account: 'DEPOSITS_HELD', debit: Number(r.deposit) }, { account: PSP, credit: Number(r.deposit) }]);
      await c.query(`UPDATE equipment_rentals SET status='returned' WHERE id=$1`, [rid]);
    });
    return { ok: true };
  }
}
