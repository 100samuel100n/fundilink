import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  Actor, BookingStatus, pct, buildInvoice, DEFAULT_FEES, haversineKm, transition, travelFee, LineItem, addonSplit, validateAddon,
} from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, parse, sha256, Audit } from '../common/core.ts';
import { WalletService } from './wallet.ts';
import { Notifier } from './notifier.ts';

const kes = (minor: number | string) => `KSh ${(Number(minor) / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
const NOTE: Record<string, [string, string]> = {
  confirmed: ['Booking accepted', 'Your professional accepted the job.'],
  declined: ['Booking declined', 'The professional could not take this job. Any payment is being refunded.'],
  scheduled: ['Booking scheduled', 'Your booking is on the calendar.'],
  en_route: ['On the way', 'Your professional has started the journey. Track them live.'],
  in_progress: ['Job started', 'Work has begun.'],
  awaiting_completion: ['Work finished', 'Please check the work and confirm so the job can close.'],
  completed: ['Job confirmed complete', 'The customer confirmed the work.'],
  cancelled: ['Booking cancelled', 'This booking was cancelled.'],
  disputed: ['Issue raised', 'An issue was raised on this booking. Support will review it.'],
};

const ARRIVAL_GEOFENCE_KM = 0.15; // pro must be within 150 m of the address to mark "arrived"

const line = z.object({ label: z.string(), kind: z.enum(['labour', 'materials', 'transport', 'other']), quantity: z.number().positive(), unitAmount: z.number().int().nonnegative() });

export const CreateBooking = z.object({
  professionalId: z.string().uuid(),
  professionalServiceId: z.string().uuid().optional(),
  kind: z.enum(['instant', 'scheduled', 'emergency']),
  description: z.string().min(5),
  address: z.string().min(3),
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  startsAt: z.string().datetime(), durationMinutes: z.number().int().min(15).max(60 * 12),
  lines: z.array(line).min(1),
  attachmentKeys: z.array(z.string()).default([]),
  organizationId: z.string().uuid().optional(),
  couponCode: z.string().min(3).max(32).optional(),
  /** escrow = pay in-app, platform holds the money. direct = pay the professional on site (cash or M-Pesa). */
  paymentMode: z.enum(['escrow', 'direct']).default('escrow'),
  directMethod: z.enum(['cash', 'mpesa']).optional(),
});

@Injectable()
export class BookingService {
  /** set by TrackingGateway so connected apps get status pushes without a circular dependency */
  onStatus?: (bookingId: string, status: string) => void;
  /** set by PaymentService: money movements that follow a booking event */
  onCompleted?: (bookingId: string) => void;
  onRefundDue?: (bookingId: string, reason: string) => void;
  constructor(private db: Db, private notifier: Notifier, private audit: Audit, private wallet: WalletService) {}

  private async flag(key: string) { const r = await this.db.one<any>('SELECT value FROM platform_settings WHERE key=$1', [key]); return r ? r.value === true || r.value === 'true' : true; }

  /** Validates a coupon and returns the discount, capped so the professional is never short-paid. */
  async coupon(userId: string, code: string, subtotal: number, cap: number) {
    const c = await this.db.one<any>(`SELECT * FROM promotional_campaigns WHERE upper(code)=upper($1) AND active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())`, [code]);
    if (!c) throw new BadRequestException('That promo code is not valid');
    const used = Number((await this.db.one<any>('SELECT count(*) n FROM coupon_redemptions WHERE campaign_id=$1', [c.id]))!.n);
    const mine = Number((await this.db.one<any>('SELECT count(*) n FROM coupon_redemptions WHERE campaign_id=$1 AND user_id=$2', [c.id, userId]))!.n);
    if (c.max_redemptions != null && used >= c.max_redemptions) throw new BadRequestException('This promo has been fully redeemed');
    if (mine >= c.per_user_limit) throw new BadRequestException('You have already used this promo');
    const raw = c.kind === 'percent' ? Math.round((subtotal * Number(c.value)) / 10_000) : Number(c.value);
    return { id: c.id as string, code: c.code as string, discount: Math.max(0, Math.min(raw, cap)) };
  }

    /** Most specific active rule wins: business account > category > booking type > platform default. */
  async rule(kind: string, professionalServiceId?: string | null, organizationId?: string | null) {
    return this.db.one<any>(
      `SELECT r.commission_bps, r.customer_fee_bps FROM commission_rules r
        WHERE r.active AND (r.kind IS NULL OR r.kind=$1::booking_kind)
          AND (r.category_id IS NULL OR r.category_id = (SELECT s.category_id FROM professional_services ps JOIN services s ON s.id=ps.service_id WHERE ps.id=$2::uuid))
          AND (r.organization_id IS NULL OR r.organization_id=$3::uuid)
        ORDER BY (r.organization_id IS NOT NULL) DESC, (r.category_id IS NOT NULL) DESC, (r.kind IS NOT NULL) DESC, r.priority DESC, r.id DESC LIMIT 1`,
      [kind, professionalServiceId ?? null, organizationId ?? null]);
  }

  /** Which payment options work for THIS job size. Yes/no only: the professional's wallet is never revealed. */
  async modesFor(professionalId: string, subtotal: number, kind: string, professionalServiceId?: string) {
    const pro = await this.db.one<any>(`SELECT id, accepts_escrow_payment, accepts_direct_payment FROM professional_profiles WHERE id=$1 AND status='active'`, [professionalId]);
    if (!pro) throw new NotFoundException('Professional unavailable');
    const k = ['instant', 'scheduled', 'quotation', 'emergency'].includes(kind) ? kind : 'instant';
    const rule = await this.rule(k, professionalServiceId);
    const commission = pct(Math.max(0, Math.round(subtotal)), rule?.commission_bps ?? DEFAULT_FEES.commissionBps);
    const directOk = (await this.flag('payments.direct_enabled')) && pro.accepts_direct_payment !== false && (await this.wallet.gate(pro.id, commission)).ok;
    const escrowOk = (await this.flag('payments.escrow_enabled')) && (pro.accepts_escrow_payment !== false || !directOk);
    const modes = [escrowOk ? 'escrow' : null, directOk ? 'direct' : null].filter(Boolean) as ('escrow' | 'direct')[];
    return { modes: modes.length ? modes : (['escrow'] as ('escrow' | 'direct')[]) };
  }

  /** Which side of the booking is this user on? Business members count as the professional side. */
  async sideOf(b: { customer_id: string; professional_id: string }, userId: string): Promise<Actor | null> {
    if (b.customer_id === userId) return 'customer';
    const pro = await this.db.one(
      `SELECT 1 FROM professional_profiles p WHERE p.id=$1 AND (p.user_id=$2 OR EXISTS (SELECT 1 FROM business_members m WHERE m.business_id=p.id AND m.user_id=$2))`,
      [b.professional_id, userId]);
    return pro ? 'professional' : null;
  }

  async create(u: AuthUser, i: z.infer<typeof CreateBooking>) {
    const pro = await this.db.one<any>(
      `SELECT *, ST_Y(base_location::geometry) lat, ST_X(base_location::geometry) lng FROM professional_profiles WHERE id=$1 AND status='active'`, [i.professionalId]);
    if (!pro) throw new NotFoundException('Professional unavailable');
    if (i.kind === 'emergency' && !pro.accepts_emergency) throw new BadRequestException('This professional does not take emergency jobs');

    const km = haversineKm({ lat: pro.lat, lng: pro.lng }, { lat: i.lat, lng: i.lng });
    const tf = travelFee(km, {
      freeRadiusKm: Number(pro.free_radius_km), perKmAmount: Number(pro.per_km_amount), minCallOut: Number(pro.min_call_out),
      maxTravelKm: Number(pro.max_travel_km), outOfAreaSurcharge: Number(pro.out_of_area_surcharge), allowOutOfArea: false,
    });
    if (!tf.ok) throw new BadRequestException('This address is outside the professional\'s service area');

    const lines: LineItem[] = [...i.lines];
    if (tf.fee > 0) lines.push({ label: `Travel (${km.toFixed(1)} km)`, kind: 'transport', quantity: 1, unitAmount: tf.fee });

    const mode = i.paymentMode;
    if (mode === 'direct') {
      if (!(await this.flag('payments.direct_enabled'))) throw new BadRequestException('Pay-on-site is not available right now. Please pay in the app.');
      if (!pro.accepts_direct_payment) throw new BadRequestException('This professional only accepts in-app payment.');
      if (i.couponCode) throw new BadRequestException('Promo codes apply to in-app payments only.');
    } else {
      if (!(await this.flag('payments.escrow_enabled'))) throw new BadRequestException('In-app payment is not available right now.');
    }

        const rule = await this.rule(i.kind, i.professionalServiceId, i.organizationId);
    const fees = { ...DEFAULT_FEES, commissionBps: rule?.commission_bps ?? DEFAULT_FEES.commissionBps, customerFeeBps: mode === 'direct' ? 0 : rule?.customer_fee_bps ?? 0 }; // on-site jobs: the customer only ever pays the professional
    const inv = buildInvoice(lines, fees);
    if (mode === 'escrow' && pro.accepts_escrow_payment === false) {
  // Direct-only professionals are booked in-app only when pay-on-site can't work for this job (empty wallet, switched off).
  const directPossible = (await this.flag('payments.direct_enabled')) && pro.accepts_direct_payment !== false && (await this.wallet.gate(pro.id, inv.commission + inv.customerFee)).ok;
  if (directPossible) throw new BadRequestException('This professional is paid on site. Choose pay-on-site.');
}
    // Promotions are funded from the platform's margin only (commission + customer fee): a coupon can never reduce the professional's pay.
    const promo = i.couponCode ? await this.coupon(u.id, i.couponCode, inv.serviceSubtotal, inv.platformRevenue) : null;
    const discount = promo?.discount ?? 0;
    const payable = inv.customerTotal - discount;

    if (mode === 'direct') {
      const gate = await this.wallet.gate(pro.id, inv.commission + inv.customerFee);
      if (!gate.ok) throw new BadRequestException('This professional is not taking pay-on-site jobs right now. Please pay in the app.'); // never reveals their wallet
    }

    const starts = new Date(i.startsAt);
    if (starts.getTime() < Date.now() + Number(pro.lead_time_hours) * 3_600_000 && i.kind !== 'emergency') throw new BadRequestException(`Needs at least ${pro.lead_time_hours}h lead time`);
    const ends = new Date(starts.getTime() + (i.durationMinutes + Number(pro.buffer_minutes)) * 60_000);

    const out = await this.db.tx(async (c) => {
      const ref = `FL-${new Date().getFullYear().toString().slice(2)}${String(randomInt(0, 1e8)).padStart(8, '0')}`;
      const b = (await c.query(
        `INSERT INTO bookings (reference, kind, status, customer_id, professional_id, professional_service_id, description, address, location,
           scheduled_during, distance_km, subtotal, customer_fee, tax, total, commission, professional_net, commission_bps, organization_id, payment_mode, direct_method)
         VALUES ($1,$2,'draft',$3,$4,$5,$6,$7, ST_SetSRID(ST_MakePoint($8,$9),4326)::geography, tstzrange($10,$11),$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
        [ref, i.kind, u.id, i.professionalId, i.professionalServiceId ?? null, i.description, i.address, i.lng, i.lat, starts, ends, km,
          inv.serviceSubtotal, inv.customerFee, inv.tax, payable, inv.commission, inv.professionalNet, fees.commissionBps, i.organizationId ?? null, mode, mode === 'direct' ? i.directMethod ?? 'cash' : null])).rows[0];
      for (const l of inv.lines) await c.query('INSERT INTO booking_items (booking_id,label,kind,quantity,unit_amount,approved_by_customer) VALUES ($1,$2,$3,$4,$5,true)', [b.id, l.label, l.kind, l.quantity, l.unitAmount]);
      for (const k of i.attachmentKeys) await c.query(`INSERT INTO booking_attachments (booking_id, uploader_id, purpose, storage_key) VALUES ($1,$2,'problem',$3)`, [b.id, u.id, k]);
      if (promo) {
        await c.query('UPDATE bookings SET discount=$2, coupon_code=$3 WHERE id=$1', [b.id, discount, promo.code]);
        await c.query('INSERT INTO coupon_redemptions (campaign_id, user_id, booking_id, amount) VALUES ($1,$2,$3,$4)', [promo.id, u.id, b.id, discount]);
      }
      await this.move(c, b.id, 'pending_payment', 'customer', u.id, {});
      let status = 'pending_payment';
      if (mode === 'direct') { // nothing to pay online: the request goes straight to the professional
        await this.move(c, b.id, 'awaiting_acceptance', 'system', null, { payOnSite: true });
        status = 'awaiting_acceptance';
        if (pro.auto_accept && i.kind === 'instant') { await this.move(c, b.id, 'confirmed', 'system', null, {}); await this.move(c, b.id, 'scheduled', 'system', null, {}); status = 'scheduled'; }
      }
      return { booking: { ...b, total: payable, discount, status }, invoice: { ...inv, discount, customerTotal: payable } };
    });
    if (mode === 'direct') {
      const nb = out.booking;
      void this.notifier.proUsers(pro.id).then((ids) => this.notifier.send(ids, { template: 'booking_request', title: i.kind === 'emergency' ? 'Emergency request' : 'New booking request', body: `${i.description.slice(0, 80)} · pay on site · ${kes(inv.professionalNet)} after commission`, data: { bookingId: nb.id }, channels: i.kind === 'emergency' ? ['in_app', 'push', 'sms'] : ['in_app', 'push'] }));
    }
    return out;
  }

  /**
   * The ONLY place booking status changes. Row-locked, validated by the domain state machine, history appended.
   */
  async move(c: PoolClient, bookingId: string, to: BookingStatus, actor: Actor, actorUserId: string | null, ctx: { reason?: string; paymentConfirmed?: boolean; payOnSite?: boolean }) {
    const b = (await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
    if (!b) throw new NotFoundException();
    const evidence = Number((await c.query(`SELECT count(*) n FROM booking_attachments WHERE booking_id=$1 AND purpose='completion_evidence'`, [bookingId])).rows[0].n);
    let row;
    try { row = transition(b.status, to, actor, { ...ctx, evidenceCount: evidence }); }
    catch (e: any) { throw new BadRequestException(e.message); }
    const extra =
      to === 'awaiting_acceptance' ? ", request_expires_at = now() + (CASE WHEN kind='emergency' THEN interval '10 minutes' ELSE interval '2 hours' END)" :
      to === 'completed' ? ", completed_at = now()" : '';
    await c.query(`UPDATE bookings SET status=$2, updated_at=now()${extra} WHERE id=$1`, [bookingId, to]);
    await c.query('INSERT INTO booking_status_history (booking_id, from_status, to_status, actor, actor_user_id, reason) VALUES ($1,$2,$3,$4,$5,$6)', [bookingId, row.from, row.to, actor, actorUserId, row.reason ?? null]);
    return { ...b, status: to };
  }

  /** Customer/pro driven transitions, with side-specific checks (geofence, PIN, ownership). */
  async act(u: AuthUser, bookingId: string, to: BookingStatus, body: { reason?: string; lat?: number; lng?: number; pin?: string }) {
    let result = await this.db.tx(async (c) => {
      const b = (await c.query('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM bookings WHERE id=$1', [bookingId])).rows[0];
      if (!b) throw new NotFoundException();
      const side = await this.sideOf(b, u.id);
      if (!side) throw new ForbiddenException();

      if (to === 'arrived') {
        if (body.lat == null || body.lng == null) throw new BadRequestException('Location is required to check in');
        if (haversineKm({ lat: body.lat, lng: body.lng }, { lat: b.lat, lng: b.lng }) > ARRIVAL_GEOFENCE_KM) throw new BadRequestException('You are not at the job location yet');
        const pin = String(randomInt(0, 10_000)).padStart(4, '0');
        await c.query('UPDATE bookings SET start_pin_hash=$2, arrived_at=now() WHERE id=$1', [bookingId, await sha256(`${bookingId}:${pin}`)]);
        await this.pinToCustomer(b.customer_id, pin, b.reference);
      }
      if (to === 'in_progress') {
        if (!body.pin || (await sha256(`${bookingId}:${body.pin}`)) !== b.start_pin_hash) throw new BadRequestException('Ask the customer for their 4-digit start PIN');
      }
      if (to === 'confirmed' && side === 'professional' && b.payment_mode === 'direct') {
        const g = await this.wallet.gate(b.professional_id, Number(b.commission) + Number(b.customer_fee), c);
        if (!g.ok) throw new BadRequestException('Top up your wallet to accept pay-on-site jobs. In-app paid jobs are not affected.');
      }
      if (to === 'awaiting_completion') {
        const open = Number((await c.query(`SELECT count(*) n FROM quotation_revisions WHERE booking_id=$1 AND (status='pending' OR (status='approved' AND payment_status='due'))`, [bookingId])).rows[0].n);
        if (open) throw new BadRequestException('There is extra work still waiting for the customer to approve or pay. Resolve it before finishing.');
        if (b.payment_mode === 'direct') {
          const dp = (await c.query('SELECT amount FROM direct_payments WHERE booking_id=$1', [bookingId])).rows[0];
          if (!dp || Number(dp.amount) < Number(b.total)) throw new BadRequestException(`Record how the customer paid (${kes(b.total)}) before finishing the job.`);
        }
      }
      if (to === 'completed' && b.payment_mode === 'direct' && side === 'customer') {
        const dp = (await c.query('UPDATE direct_payments SET customer_confirmed_at=now() WHERE booking_id=$1 RETURNING id', [bookingId])).rows[0];
        if (!dp) throw new BadRequestException('The professional has not recorded your payment yet.');
      }
      const out = await this.move(c, bookingId, to, side, u.id, { reason: body.reason });
      return { ...out, _side: side, _prev: b.status, _pro: b.professional_id, _cust: b.customer_id, _ref: b.reference };
    });
    const { _side: side, _prev: prev, _pro: proId, _cust: custId, _ref: ref, ...clean } = result as any;
    const note = NOTE[to];
    if (note) {
      const targets = side === 'customer' ? await this.notifier.proUsers(proId) : [custId];
      void this.notifier.send(targets, { template: `booking_${to}`, title: `${note[0]} · ${ref}`, body: body.reason && ['declined', 'cancelled', 'disputed'].includes(to) ? `${note[1]} Reason: ${body.reason}` : note[1], data: { bookingId } });
    }
    if (to === 'completed') this.onCompleted?.(bookingId);
    if (to === 'declined' || (to === 'cancelled' && (side === 'professional' || ['awaiting_acceptance', 'confirmed', 'scheduled'].includes(prev)))) this.onRefundDue?.(bookingId, body.reason ?? 'Booking cancelled');
    result = clean;
    this.onStatus?.(bookingId, to); // after commit
    return result;
  }

  private async pinToCustomer(customerId: string, pin: string, ref: string) {
    await this.db.query(`INSERT INTO notifications (user_id, template, title, body, data, channels) VALUES ($1,'arrival_pin',$2,$3,$4,'{in_app,push}')`,
      [customerId, 'Your professional has arrived', `Share PIN ${pin} to start the job (${ref})`, JSON.stringify({ pin, ref })]);
  }

  /* =====================================================================================================
     Add-ons ("Extra Work"): a professional finds a broken valve mid-job. Nothing extra is billable until the customer approves
     it in-app, so the receipt stays official and the platform keeps its commission.
     ===================================================================================================== */
  async submitRevision(u: AuthUser, bookingId: string, i: { reason: string; discovered: string; extraLines: LineItem[]; attachmentKeys?: string[] }) {
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [bookingId]);
    if (!b || (await this.sideOf(b, u.id)) !== 'professional') throw new ForbiddenException();
    if (!['in_progress', 'arrived'].includes(b.status)) throw new BadRequestException('Extra work can only be added while the job is under way');
    if (!i.reason.trim()) throw new BadRequestException('Explain why the price is changing');
    let total: number;
    try { total = validateAddon(i.extraLines, { bookingSubtotal: Number(b.subtotal) }); } catch (e: any) { throw new BadRequestException(e.message); }
    const pending = Number((await this.db.one<any>(`SELECT count(*) n FROM quotation_revisions WHERE booking_id=$1 AND status='pending'`, [bookingId]))!.n);
    if (pending >= 3) throw new BadRequestException('You already have extra work waiting for approval. Wait for the customer to respond.');
    const split = addonSplit(i.extraLines, b.commission_bps);
    const mins = await this.wallet.setting('addon.expiry_minutes', 180);
    const lines = buildInvoice(i.extraLines, { ...DEFAULT_FEES, commissionBps: b.commission_bps, customerFeeBps: 0 }).lines;
    const r = await this.db.tx(async (c) => {
      const row = (await c.query(
        `INSERT INTO quotation_revisions (booking_id, requested_by, reason, discovered, previous_total, revised_total, extra_items, extra_total, extra_commission, extra_net, evidence_keys, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + ($12 || ' minutes')::interval) RETURNING id, expires_at`,
        [bookingId, u.id, i.reason, i.discovered, b.total, Number(b.total) + split.gross, JSON.stringify(lines), split.gross, split.commission, split.net, i.attachmentKeys ?? [], String(mins)])).rows[0];
      for (const k of i.attachmentKeys ?? []) await c.query(`INSERT INTO booking_attachments (booking_id, uploader_id, purpose, storage_key) VALUES ($1,$2,'addon_evidence',$3)`, [bookingId, u.id, k]);
      return row;
    });
    const pro = await this.db.one<any>('SELECT display_name FROM professional_profiles WHERE id=$1', [b.professional_id]);
    await this.notifier.send(b.customer_id, { template: 'revision_request', title: 'Extra work needs your approval', body: `${pro?.display_name ?? 'Your professional'} found: ${i.discovered.slice(0, 90)}. Extra cost ${kes(total)}. Nothing is charged until you approve.`, data: { bookingId, revisionId: r.id } });
    return { id: r.id, expires_at: r.expires_at, extra_total: split.gross };
  }

  async decideRevision(u: AuthUser, revisionId: string, approve: boolean) {
    const out = await this.db.tx(async (c) => {
      const r = (await c.query('SELECT r.*, b.customer_id, b.professional_id, b.reference, b.status AS booking_status, b.payment_mode FROM quotation_revisions r JOIN bookings b ON b.id=r.booking_id WHERE r.id=$1 FOR UPDATE OF r', [revisionId])).rows[0];
      if (!r || r.customer_id !== u.id) throw new ForbiddenException();
      if (r.status !== 'pending') throw new BadRequestException(r.status === 'expired' ? 'This request expired. Ask your professional to send it again.' : r.status === 'withdrawn' ? 'The professional withdrew this request' : 'Already decided');
      if (new Date(r.expires_at).getTime() < Date.now()) { await c.query(`UPDATE quotation_revisions SET status='expired' WHERE id=$1`, [revisionId]); return { expired: true } as any; }
      if (!['in_progress', 'arrived'].includes(r.booking_status)) throw new BadRequestException('The job is no longer in progress');
      const escrow = r.payment_mode === 'escrow';
      await c.query(`UPDATE quotation_revisions SET customer_decision=$2, status=$2, decided_at=now(), payment_status=$3 WHERE id=$1`, [revisionId, approve ? 'approved' : 'rejected', approve && escrow ? 'due' : 'none']);
      if (approve) {
        for (const l of r.extra_items) await c.query('INSERT INTO booking_items (booking_id,label,kind,quantity,unit_amount,approved_by_customer,revision_id) VALUES ($1,$2,$3,$4,$5,true,$6)', [r.booking_id, l.label, l.kind, l.quantity, l.unitAmount, revisionId]);
        await c.query('UPDATE bookings SET subtotal=subtotal+$2, total=total+$2, commission=commission+$3, professional_net=professional_net+$4 WHERE id=$1', [r.booking_id, r.extra_total, r.extra_commission, r.extra_net]);
      }
      return { approved: approve, paymentRequired: approve && escrow, amount: Number(r.extra_total), mode: r.payment_mode, _pro: r.professional_id, _ref: r.reference, _bid: r.booking_id };
    });
    if (out.expired) throw new BadRequestException('This request expired. Ask your professional to send it again.');
    const { _pro, _ref, _bid, ...res } = out;
    void this.notifier.proUsers(_pro).then((ids) => this.notifier.send(ids, {
      template: approve ? 'addon_approved' : 'addon_declined', title: approve ? 'Extra work approved' : 'Extra work declined',
      body: approve ? (res.paymentRequired ? `Approved for ${_ref}. Waiting for the customer to pay ${kes(res.amount)}; we will tell you the moment it lands.` : `Approved for ${_ref}: ${kes(res.amount)} added to the on-site total. Collect it from the customer.`) : `The customer declined the extra work on ${_ref}. Continue with the original scope.`,
      data: { bookingId: _bid, revisionId: revisionId } }));
    return res;
  }

  /** Professional takes back an extra-work request that is still unanswered, or approved but not yet paid. */
  async withdrawRevision(u: AuthUser, revisionId: string) {
    const customerId = await this.db.tx(async (c) => {
      const r = (await c.query('SELECT r.*, b.professional_id, b.customer_id, b.reference FROM quotation_revisions r JOIN bookings b ON b.id=r.booking_id WHERE r.id=$1 FOR UPDATE OF r', [revisionId])).rows[0];
      if (!r || (await this.sideOf({ customer_id: r.customer_id, professional_id: r.professional_id }, u.id)) !== 'professional') throw new ForbiddenException();
      const unpaidApproved = r.status === 'approved' && r.payment_status !== 'paid';
      if (r.status !== 'pending' && !unpaidApproved) throw new BadRequestException('This extra work can no longer be withdrawn');
      if (unpaidApproved) {
        await c.query('DELETE FROM booking_items WHERE revision_id=$1', [revisionId]);
        await c.query('UPDATE bookings SET subtotal=subtotal-$2, total=total-$2, commission=commission-$3, professional_net=professional_net-$4 WHERE id=$1', [r.booking_id, r.extra_total, r.extra_commission, r.extra_net]);
      }
      await c.query(`UPDATE quotation_revisions SET status='withdrawn', payment_status='none' WHERE id=$1`, [revisionId]);
      return r.customer_id as string;
    });
    await this.notifier.send(customerId, { template: 'addon_withdrawn', title: 'Extra work withdrawn', body: 'Your professional withdrew the extra-work request. Nothing is charged.', data: { revisionId } });
    return { withdrawn: true };
  }

  async listRevisions(u: AuthUser, bookingId: string) {
    const b = await this.db.one<any>('SELECT customer_id, professional_id FROM bookings WHERE id=$1', [bookingId]);
    if (!b) throw new NotFoundException();
    if (!(await this.sideOf(b, u.id)) && !u.perms.includes('*') && !u.perms.includes('bookings.read')) throw new ForbiddenException();
    return this.db.query(
      `SELECT r.id, r.status, r.payment_status, r.reason, r.discovered, r.extra_items AS items, r.extra_total, r.expires_at, r.created_at, r.decided_at, r.paid_at, r.evidence_keys,
              (SELECT row_to_json(x) FROM (SELECT pi.id, pi.status, pi.failure_reason FROM payment_intents pi WHERE pi.purpose='addon' AND pi.subject_id=r.id ORDER BY pi.created_at DESC LIMIT 1) x) AS payment
         FROM quotation_revisions r WHERE r.booking_id=$1 ORDER BY r.created_at DESC`, [bookingId]);
  }

  /** Expire unanswered extra-work requests (housekeeping job). */
  async expireRevisions() {
    const rows = await this.db.query<any>(`UPDATE quotation_revisions r SET status='expired' FROM bookings b WHERE b.id=r.booking_id AND r.status='pending' AND r.expires_at < now() RETURNING r.id, b.customer_id, b.professional_id, b.id AS booking_id`);
    for (const r of rows) {
      await this.notifier.send(r.customer_id, { template: 'addon_expired', title: 'Extra-work request expired', body: 'The request was not answered in time. Nothing was charged.', data: { bookingId: r.booking_id } });
      await this.notifier.send(await this.notifier.proUsers(r.professional_id), { template: 'addon_expired', title: 'Extra-work request expired', body: 'The customer did not respond in time. Send it again if it is still needed.', data: { bookingId: r.booking_id } });
    }
    return rows.length;
  }

  /** Pay-on-site (Model 2): the professional records how the customer paid; the customer then confirms completion. */
  async recordDirectPayment(u: AuthUser, bookingId: string, i: { method: 'cash' | 'mpesa'; reference?: string }) {
    const b = await this.db.one<any>('SELECT * FROM bookings WHERE id=$1', [bookingId]);
    if (!b || (await this.sideOf(b, u.id)) !== 'professional') throw new ForbiddenException();
    if (b.payment_mode !== 'direct') throw new BadRequestException('This booking was paid in the app');
    if (!['in_progress', 'awaiting_completion'].includes(b.status)) throw new BadRequestException('Record the payment once the work is under way');
    const open = Number((await this.db.one<any>(`SELECT count(*) n FROM quotation_revisions WHERE booking_id=$1 AND status='pending'`, [bookingId]))!.n);
    if (open) throw new BadRequestException('Wait for the customer to answer the extra-work request first, so the total is final.');
    const ref = i.reference?.trim().toUpperCase();
    if (i.method === 'mpesa' && !(ref && /^[A-Z0-9]{8,12}$/.test(ref))) throw new BadRequestException('Enter the M-Pesa confirmation code from your SMS (e.g. SGH7K2L9QX)');
    await this.db.query(
      `INSERT INTO direct_payments (booking_id, recorded_by, method, amount, reference) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (booking_id) DO UPDATE SET method=EXCLUDED.method, amount=EXCLUDED.amount, reference=EXCLUDED.reference, recorded_at=now(), recorded_by=EXCLUDED.recorded_by`,
      [bookingId, u.id, i.method, b.total, i.method === 'mpesa' ? ref : null]);
    await this.db.query('UPDATE bookings SET direct_method=$2 WHERE id=$1', [bookingId, i.method]);
    await this.notifier.send(b.customer_id, { template: 'direct_payment_recorded', title: 'Payment recorded', body: `Your professional recorded ${kes(b.total)} received by ${i.method === 'cash' ? 'cash' : 'M-Pesa'}. Please confirm once you are happy with the work.`, data: { bookingId } });
    return { recorded: true, amount: Number(b.total), method: i.method };
  }
}

@Controller('bookings')
export class BookingController {
  constructor(private s: BookingService, private db: Db) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.s.create(u, parse(CreateBooking, b)); }

  @Get() async mine(@CurrentUser() u: AuthUser, @Query('as') as: string) {
    return as === 'professional'
      ? this.db.query(`SELECT b.* FROM bookings b JOIN professional_profiles p ON p.id=b.professional_id WHERE p.user_id=$1 OR EXISTS (SELECT 1 FROM business_members m WHERE m.business_id=p.id AND m.user_id=$1) ORDER BY b.created_at DESC LIMIT 100`, [u.id])
      : this.db.query('SELECT * FROM bookings WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100', [u.id]);
  }

    @Get('payment-modes') paymentModes(@Query('professionalId') professionalId: string, @Query('subtotal') subtotal: string, @Query('kind') kind = 'instant', @Query('professionalServiceId') serviceId?: string) {
    return this.s.modesFor(professionalId, Number(subtotal) || 0, kind, serviceId);
  }


  @Get(':id') async get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const b = await this.db.one<any>('SELECT *, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM bookings WHERE id=$1', [id]);
    if (!b) throw new NotFoundException();
    const side = await this.s.sideOf(b, u.id);
    if (!side && !u.perms.includes('bookings.read') && !u.perms.includes('*')) throw new ForbiddenException();
    const [items, history] = await Promise.all([
      this.db.query('SELECT * FROM booking_items WHERE booking_id=$1', [id]),
      this.db.query('SELECT * FROM booking_status_history WHERE booking_id=$1 ORDER BY id', [id]),
    ]);
    // customer address/exact point stays hidden from the pro until the booking is confirmed
    if (side === 'professional' && ['awaiting_acceptance', 'declined'].includes(b.status)) { delete b.address; delete b.lat; delete b.lng; delete b.location; }
    delete b.start_pin_hash;
    const [directPayment, revisions, payments] = await Promise.all([
      this.db.one('SELECT method, amount, reference, recorded_at, customer_confirmed_at FROM direct_payments WHERE booking_id=$1', [id]),
      side ? this.s.listRevisions(u, id) : [],
      side ? this.db.query(`SELECT pi.id, pi.purpose, pi.amount, pi.status, pi.provider_receipt AS receipt, pi.paid_at FROM payment_intents pi WHERE pi.booking_id=$1 AND pi.status='succeeded' ORDER BY pi.paid_at`, [id]) : [],
    ]);
    return { ...b, items, history, side, directPayment: directPayment ?? null, revisions, payments };
  }

  @Post(':id/transition')
  transition(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ to: z.string(), reason: z.string().optional(), lat: z.number().optional(), lng: z.number().optional(), pin: z.string().length(4).optional() }), b);
    return this.s.act(u, id, i.to as BookingStatus, i);
  }

  @Post(':id/revisions')
  revise(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.s.submitRevision(u, id, parse(z.object({ reason: z.string(), discovered: z.string(), extraLines: z.array(line).min(1).max(10), attachmentKeys: z.array(z.string()).max(5).optional() }), b));
  }
  @Get(':id/revisions')
  revisions(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.listRevisions(u, id); }
  @Post('revisions/:rid/withdraw')
  withdraw(@CurrentUser() u: AuthUser, @Param('rid') rid: string) { return this.s.withdrawRevision(u, rid); }
  @Post(':id/direct-payment')
  directPayment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.s.recordDirectPayment(u, id, parse(z.object({ method: z.enum(['cash', 'mpesa']), reference: z.string().max(20).optional() }), b));
  }
  @Post('revisions/:rid/decision')
  decide(@CurrentUser() u: AuthUser, @Param('rid') rid: string, @Body() b: unknown) {
    return this.s.decideRevision(u, rid, parse(z.object({ approve: z.boolean() }), b).approve);
  }
}
