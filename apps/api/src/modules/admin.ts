import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Audit, Perm, parse } from '../common/core.ts';
import { PaymentService } from './payments.ts';

/** Every route here is permission-checked server-side and every sensitive write is audited (append-only table). */
@Controller('admin')
export class AdminController {
  constructor(private db: Db, private audit: Audit, private pay: PaymentService) {}

  @Perm('analytics.read') @Get('overview')
  async overview() {
    const [users] = await this.db.query(`SELECT
      (SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code='customer') customers,
      (SELECT count(*) FROM professional_profiles) professionals,
      (SELECT count(*) FROM professional_profiles WHERE status='active') active_professionals,
      (SELECT count(DISTINCT professional_id) FROM professional_verifications WHERE level='identity' AND state='approved') verified_professionals,
      (SELECT count(*) FROM professional_verifications WHERE state='pending') pending_verifications,
      (SELECT count(DISTINCT county) FROM professional_profiles WHERE status='active') active_counties`);
    const [b] = await this.db.query(`SELECT count(*) total,
      count(*) FILTER (WHERE status IN ('completed','settlement_pending','settled')) completed,
      count(*) FILTER (WHERE status='cancelled') cancelled, count(*) FILTER (WHERE status='disputed') disputed,
      COALESCE(sum(total) FILTER (WHERE status IN ('completed','settlement_pending','settled')),0)::bigint gmv FROM bookings`);
    const [fin] = await this.db.query(`SELECT
      COALESCE((SELECT credit_balance FROM ledger_balances WHERE account='PLATFORM_REVENUE'),0)::bigint commission_revenue,
      COALESCE((SELECT sum(amount) FROM refunds WHERE status='processed'),0)::bigint refunds,
      COALESCE((SELECT sum(amount) FROM settlements WHERE status IN ('pending','processing')),0)::bigint pending_settlements,
      COALESCE((SELECT sum(amount) FROM activation_payments ap JOIN payment_intents pi ON pi.id=ap.payment_intent_id WHERE pi.status='succeeded'),0)::bigint activation_revenue`);
    const series = await this.db.query(`SELECT date_trunc('day', created_at)::date AS day, count(*) bookings, COALESCE(sum(total) FILTER (WHERE status IN ('completed','settlement_pending','settled')),0)::bigint gmv FROM bookings WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`);
    const topServices = await this.db.query(`SELECT COALESCE(s.name,'Other') service, count(*) bookings FROM bookings b LEFT JOIN professional_services ps ON ps.id=b.professional_service_id LEFT JOIN services s ON s.id=ps.service_id GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);
    const counties = await this.db.query(`SELECT county, count(*) professionals FROM professional_profiles WHERE status='active' GROUP BY 1 ORDER BY 2 DESC`);
    return { ...users, bookings: b, finance: fin, series, topServices, counties, takeRatePct: Number(b.gmv) ? Number(((Number(fin.commission_revenue) / Number(b.gmv)) * 100).toFixed(2)) : 0 };
  }

  /* ---- Verification queue ---- */
  @Perm('verification.review') @Get('verifications')
  queue(@Query('state') state = 'pending') {
    return this.db.query(`SELECT v.id, v.level, v.state, p.id professional_id, p.display_name, p.county,
        (SELECT json_agg(json_build_object('kind',kind,'title',title,'issuer',issuer,'ref',reference_no)) FROM professional_qualifications q WHERE q.professional_id=p.id) qualifications,
        (SELECT json_agg(c.name) FROM professional_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.professional_id=p.id) categories
      FROM professional_verifications v JOIN professional_profiles p ON p.id=v.professional_id WHERE v.state=$1::verification_state ORDER BY v.id LIMIT 100`, [state]);
  }

  @Perm('verification.review') @Post('verifications/:id/decide')
  async decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ decision: z.enum(['approved', 'rejected', 'suspended', 'revoked']), reason: z.string().min(3), expiresAt: z.string().datetime().optional() }), b);
    const v = await this.db.one<any>('SELECT * FROM professional_verifications WHERE id=$1', [id]);
    if (!v) throw new BadRequestException('Unknown verification');
    await this.db.tx(async (c) => {
      await c.query('UPDATE professional_verifications SET state=$2, reviewed_by=$3, decision_reason=$4, reviewed_at=now(), expires_at=$5 WHERE id=$1', [id, i.decision, u.id, i.reason, i.expiresAt ?? null]);
      // approving identity activates the listing (activation fee rules are applied separately); revoking pulls it from search
      if (v.level === 'identity' && i.decision === 'approved') await c.query(`UPDATE professional_profiles SET status='active', activated_at=COALESCE(activated_at, now()) WHERE id=$1 AND status IN ('in_review','onboarding')`, [v.professional_id]);
      if (v.level === 'identity' && ['suspended', 'revoked'].includes(i.decision)) await c.query(`UPDATE professional_profiles SET status='suspended' WHERE id=$1`, [v.professional_id]);
      await this.audit.log(u, { action: 'verification.decide', kind: 'professional_verification', id, before: { state: v.state }, after: { state: i.decision }, reason: i.reason, ip: req.ip, device: req.headers['user-agent'] }, c);
    });
    return { ok: true };
  }

  /* ---- Accounts ---- */
  @Perm('professionals.suspend') @Post('professionals/:id/suspend')
  async suspend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ reason: z.string().min(5), endsAt: z.string().datetime().optional() }), b);
    const p = await this.db.one<any>('SELECT user_id, status FROM professional_profiles WHERE id=$1', [id]);
    if (!p) throw new BadRequestException();
    await this.db.tx(async (c) => {
      await c.query(`UPDATE professional_profiles SET status='suspended' WHERE id=$1`, [id]);
      await c.query(`INSERT INTO account_restrictions (user_id, kind, reason, imposed_by, ends_at) VALUES ($1,'suspension',$2,$3,$4)`, [p.user_id, i.reason, u.id, i.endsAt ?? null]);
      await this.audit.log(u, { action: 'professional.suspend', kind: 'professional', id, before: { status: p.status }, after: { status: 'suspended' }, reason: i.reason, ip: req.ip }, c);
    });
    return { ok: true, appealPath: 'Professional can appeal via support; records are preserved.' };
  }

  /* ---- Money ---- */
  @Perm('transactions.read') @Get('transactions') txs() { return this.db.query(`SELECT t.id, t.kind, t.booking_id, t.created_at, json_agg(json_build_object('account',e.account,'debit',e.debit,'credit',e.credit)) entries FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id=t.id GROUP BY t.id ORDER BY t.id DESC LIMIT 200`); }
  @Perm('transactions.read') @Get('ledger/balances') balances() { return this.db.query('SELECT * FROM ledger_balances ORDER BY account'); }
  @Perm('settlements.read') @Get('settlements') settlements() { return this.db.query(`SELECT s.*, p.display_name FROM settlements s JOIN professional_profiles p ON p.id=s.professional_id ORDER BY s.created_at DESC LIMIT 200`); }
  @Perm('refunds.approve.small') @Get('refunds') refunds() { return this.db.query(`SELECT r.*, b.reference FROM refunds r JOIN bookings b ON b.id=r.booking_id ORDER BY r.created_at DESC LIMIT 200`); }

  /* ---- Disputes ---- */
  @Perm('disputes.resolve') @Get('disputes') disputes() { return this.db.query(`SELECT d.*, b.reference FROM disputes d LEFT JOIN bookings b ON b.id=d.booking_id ORDER BY d.resolution_due_at LIMIT 200`); }
  @Perm('disputes.resolve') @Post('disputes/:id/resolve')
  async resolve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ outcome: z.enum(['resolved_customer', 'resolved_professional', 'resolved_split']), resolution: z.string().min(10), refundAmount: z.number().int().nonnegative().default(0) }), b);
    const d = await this.db.one<any>('SELECT * FROM disputes WHERE id=$1', [id]);
    if (!d) throw new BadRequestException();
    await this.db.query(`UPDATE disputes SET status=$2::dispute_status, resolution=$3, refund_amount=$4, resolved_at=now(), assigned_to=$5 WHERE id=$1`, [id, i.outcome, i.resolution, i.refundAmount, u.id]);
    await this.audit.log(u, { action: 'dispute.resolve', kind: 'dispute', id, before: { status: d.status }, after: i, reason: i.resolution, ip: req.ip });
    return { ok: true };
  }

  /* ---- Settings: commission, activation fee, ranking weights ---- */
  @Perm('commission.write') @Put('commission')
  async commission(@CurrentUser() u: AuthUser, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ commissionBps: z.number().int().min(0).max(3000), customerFeeBps: z.number().int().min(0).max(2000).default(0), reason: z.string().min(5) }), b);
    const prev = await this.db.one('SELECT * FROM commission_rules WHERE active AND category_id IS NULL AND kind IS NULL AND organization_id IS NULL ORDER BY id DESC LIMIT 1');
    await this.db.tx(async (c) => {
      await c.query(`UPDATE commission_rules SET active=false WHERE category_id IS NULL AND kind IS NULL AND organization_id IS NULL`);
      await c.query(`INSERT INTO commission_rules (commission_bps, customer_fee_bps) VALUES ($1,$2)`, [i.commissionBps, i.customerFeeBps]);
      await this.audit.log(u, { action: 'commission.change', kind: 'commission_rule', id: 'default', before: prev, after: i, reason: i.reason, ip: req.ip }, c);
    });
    return { ok: true, note: 'Applies to new bookings only; existing bookings keep the commission frozen at creation.' };
  }

  @Perm('activation_fees.write') @Put('activation-fee')
  async activation(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ amount: z.number().int().min(0), enabled: z.boolean(), founding_waiver: z.boolean().default(true), reason: z.string().min(5) }), b);
    const prev = await this.db.one(`SELECT * FROM activation_fee_rules WHERE country_code='KE'`);
    await this.db.query(`UPDATE activation_fee_rules SET amount=$1, enabled=$2, founding_waiver=$3 WHERE country_code='KE'`, [i.amount, i.enabled, i.founding_waiver]);
    await this.audit.log(u, { action: 'activation_fee.change', kind: 'activation_fee_rule', id: 'KE', before: prev, after: i, reason: i.reason });
    return { ok: true, note: 'A paid activation never affects ranking, ratings or verification.' };
  }

  @Perm('audit.read') @Get('audit-logs') logs(@Query('limit') limit = '200') { return this.db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT $1', [Math.min(Number(limit) || 200, 1000)]); }
  @Perm('analytics.read') @Get('fraud-flags') flags() { return this.db.query(`SELECT * FROM fraud_flags WHERE state='open' ORDER BY score DESC LIMIT 100`); }
}
