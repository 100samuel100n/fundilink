import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post, Put, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Audit, parse, Perm } from '../common/core.ts';
import { Storage } from '../providers/providers.ts';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

@Injectable()
export class ProfessionalService {
  constructor(private db: Db, private audit: Audit) {}

  async mine(userId: string) {
    const p = await this.db.one<any>('SELECT * FROM professional_profiles WHERE user_id=$1', [userId]);
    if (!p) throw new ForbiddenException('No professional profile');
    return p;
  }

  async onboard(u: AuthUser, i: z.infer<typeof Onboard>) {
    const slug = `${slugify(i.businessName ?? i.displayName)}-${randomUUID().slice(0, 4)}`;
    return this.db.tx(async (c) => {
      const p = (await c.query(
        `INSERT INTO professional_profiles (user_id, account_type, slug, display_name, business_name, headline, bio, years_experience, languages, base_location, base_area, county,
           max_travel_km, free_radius_km, per_km_amount, min_call_out, accepts_emergency, auto_accept, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($10,$11),4326)::geography, $12,$13,$14,$15,$16,$17,$18,$19,'in_review') RETURNING *`,
        [u.id, i.accountType, slug, i.displayName, i.businessName ?? null, i.headline ?? null, i.bio ?? null, i.yearsExperience ?? null, i.languages, i.lng, i.lat, i.area ?? null, i.county,
          i.maxTravelKm, i.freeRadiusKm, i.perKmAmount, i.minCallOut, i.acceptsEmergency, i.autoAccept])).rows[0];
      for (const [idx, cid] of i.categoryIds.entries()) await c.query('INSERT INTO professional_categories (professional_id, category_id, is_primary) VALUES ($1,$2,$3)', [p.id, cid, idx === 0]);
      for (const a of i.serviceAreas) await c.query('INSERT INTO professional_service_areas (professional_id, county, town, estate) VALUES ($1,$2,$3,$4)', [p.id, a.county, a.town ?? null, a.estate ?? null]);
      for (const a of i.availability) await c.query('INSERT INTO professional_availability (professional_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)', [p.id, a.weekday, a.start, a.end]);
      // Queue verification: basic + identity always; qualification only if a category requires a licence AND they provided one.
      await c.query(`INSERT INTO professional_verifications (professional_id, level, state) VALUES ($1,'identity','pending') ON CONFLICT DO NOTHING`, [p.id]);
      await c.query(`INSERT INTO user_roles SELECT $1, id FROM roles WHERE code='professional' ON CONFLICT DO NOTHING`, [u.id]);
      if (i.accountType === 'business') await c.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1,$2,'admin')`, [p.id, u.id]);
      return p;
    });
  }

  /** Missing a required licence blocks the *qualification badge and licensed categories*, never general onboarding. */
  async licenceGaps(professionalId: string) {
    return this.db.query(
      `SELECT c.name, c.license_body FROM professional_categories pc JOIN categories c ON c.id=pc.category_id
       WHERE pc.professional_id=$1 AND c.requires_license
         AND NOT EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pc.professional_id AND v.level='qualification' AND v.state='approved')`, [professionalId]);
  }

  async upsertService(u: AuthUser, i: z.infer<typeof ServiceInput>) {
    const p = await this.mine(u.id);
    return this.db.tx(async (c) => {
      const ps = (await c.query(
        `INSERT INTO professional_services (professional_id, service_id, title, description, duration_minutes, warranty_days, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (professional_id, service_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
           duration_minutes=EXCLUDED.duration_minutes, warranty_days=EXCLUDED.warranty_days, enabled=EXCLUDED.enabled RETURNING id`,
        [p.id, i.serviceId, i.title ?? null, i.description ?? null, i.durationMinutes, i.warrantyDays ?? null, i.enabled])).rows[0];
      await c.query('DELETE FROM service_pricing WHERE professional_service_id=$1', [ps.id]);
      for (const pr of i.pricing) await c.query('INSERT INTO service_pricing (professional_service_id, model, amount, min_charge, unit_label, emergency_amount) VALUES ($1,$2,$3,$4,$5,$6)', [ps.id, pr.model, pr.amount ?? null, pr.minCharge, pr.unit ?? null, pr.emergencyAmount ?? null]);
      return ps;
    });
  }

  /** Payout account changes are high-risk: OTP-confirmed, name-checked, audited, and trigger a notification. */
  async setPayoutAccount(u: AuthUser, i: { kind: 'mobile_money' | 'bank'; provider: string; accountRef: string; accountName: string }, ip?: string) {
    const p = await this.mine(u.id);
    const prev = await this.db.one<any>('SELECT id, provider, account_name FROM payout_accounts WHERE professional_id=$1 AND active', [p.id]);
    await this.db.tx(async (c) => {
      await c.query('UPDATE payout_accounts SET active=false WHERE professional_id=$1', [p.id]);
      await c.query(`INSERT INTO payout_accounts (professional_id, kind, provider, account_ref_encrypted, account_name) VALUES ($1,$2,$3,convert_to($4,'UTF8'),$5)`, [p.id, i.kind, i.provider, i.accountRef, i.accountName]);
      await this.audit.log(u, { action: 'payout_account.change', kind: 'professional', id: p.id, before: prev ?? null, after: { provider: i.provider, accountName: i.accountName }, ip }, c);
      await c.query(`INSERT INTO notifications (user_id, template, title, body, channels) VALUES ($1,'payout_changed','Payout account changed','If this was not you, contact support immediately.','{in_app,sms,email}')`, [u.id]);
    });
    return { ok: true };
  }
}

const Onboard = z.object({
  accountType: z.enum(['individual', 'business']).default('individual'),
  displayName: z.string().min(2), businessName: z.string().optional(), headline: z.string().max(120).optional(), bio: z.string().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(70).optional(), languages: z.array(z.string()).default(['en', 'sw']),
  lat: z.number(), lng: z.number(), area: z.string().optional(), county: z.string(),
  maxTravelKm: z.number().positive().default(15), freeRadiusKm: z.number().min(0).default(5), perKmAmount: z.number().int().min(0).default(0), minCallOut: z.number().int().min(0).default(0),
  acceptsEmergency: z.boolean().default(false), autoAccept: z.boolean().default(false),
  categoryIds: z.array(z.number().int()).min(1),
  serviceAreas: z.array(z.object({ county: z.string(), town: z.string().optional(), estate: z.string().optional() })).default([]),
  availability: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() })).default([]),
});
const ServiceInput = z.object({
  serviceId: z.number().int(), title: z.string().optional(), description: z.string().optional(), durationMinutes: z.number().int().min(15).default(60), warrantyDays: z.number().int().optional(), enabled: z.boolean().default(true),
  pricing: z.array(z.object({ model: z.enum(['fixed', 'hourly', 'daily', 'call_out', 'per_unit', 'per_sqm', 'project', 'quotation', 'recurring']), amount: z.number().int().nonnegative().optional(), minCharge: z.number().int().default(0), unit: z.string().optional(), emergencyAmount: z.number().int().optional() })).min(1),
});

@Controller('professional')
export class ProfessionalController {
  constructor(private s: ProfessionalService, private db: Db, private storage: Storage) {}

  @Post('onboard') onboard(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.s.onboard(u, parse(Onboard, b)); }
    @Get('me') async me(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    const [pt] = await this.db.query('SELECT ST_Y(base_location::geometry) AS lat, ST_X(base_location::geometry) AS lng FROM professional_profiles WHERE id=$1', [p.id]);
    const service_areas = await this.db.query('SELECT county, town, estate FROM professional_service_areas WHERE professional_id=$1', [p.id]);
    return { ...p, lat: pt?.lat ?? null, lng: pt?.lng ?? null, area: p.base_area, service_areas, licenceGaps: await this.s.licenceGaps(p.id) };
  }

    @Put('location') async setLocation(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({
      lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), county: z.string().min(2), area: z.string().optional(),
      maxTravelKm: z.number().positive().max(500).optional(), freeRadiusKm: z.number().min(0).max(500).optional(),
      serviceAreas: z.array(z.object({ county: z.string(), town: z.string().optional(), estate: z.string().optional() })).max(60).optional(),
    }), b);
    const p = await this.s.mine(u.id);
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE professional_profiles SET base_location=ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, base_area=$4, county=$5,
           max_travel_km=COALESCE($6,max_travel_km), free_radius_km=COALESCE($7,free_radius_km), location_updated_at=now() WHERE id=$1`,
        [p.id, i.lng, i.lat, i.area ?? null, i.county, i.maxTravelKm ?? null, i.freeRadiusKm ?? null]);
      if (i.serviceAreas) {
        await c.query('DELETE FROM professional_service_areas WHERE professional_id=$1', [p.id]);
        for (const a of i.serviceAreas) await c.query('INSERT INTO professional_service_areas (professional_id, county, town, estate) VALUES ($1,$2,$3,$4)', [p.id, a.county, a.town ?? null, a.estate ?? null]);
      }
    });
    return { ok: true };
  }
  
  @Put('services') service(@CurrentUser() u: AuthUser, @Body() b: unknown) { return this.s.upsertService(u, parse(ServiceInput, b)); }
  @Put('payout-account') payout(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.setPayoutAccount(u, parse(z.object({ kind: z.enum(['mobile_money', 'bank']), provider: z.string(), accountRef: z.string().min(6), accountName: z.string().min(2) }), b));
  }

  @Put('payment-modes') async paymentModes(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ escrow: z.boolean(), direct: z.boolean() }), b);
    if (!i.escrow && !i.direct) throw new BadRequestException('Offer at least one way to be paid');
    const p = await this.s.mine(u.id);
    await this.db.query('UPDATE professional_profiles SET accepts_escrow_payment=$2, accepts_direct_payment=$3 WHERE id=$1', [p.id, i.escrow, i.direct]);
    return { escrow: i.escrow, direct: i.direct };
  }

  @Get('overview') async overview(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    const [t] = await this.db.query(`SELECT
      count(*) FILTER (WHERE status IN ('scheduled','confirmed') AND scheduled_during && tstzrange(date_trunc('day',now()), date_trunc('day',now()) + interval '1 day')) AS today,
      count(*) FILTER (WHERE status='awaiting_acceptance') AS pending_requests,
      COALESCE(sum(professional_net) FILTER (WHERE status IN ('completed','settlement_pending','settled') AND completed_at >= date_trunc('month',now())),0) AS month_earnings
      FROM bookings WHERE professional_id=$1`, [p.id]);
    return { ...t, rating: p.rating_avg, reviews: p.rating_count, status: p.status };
  }
  @Get('analytics') async analytics(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    const [a] = await this.db.query(`SELECT count(*) AS bookings, COALESCE(avg(total),0)::bigint AS avg_value FROM bookings WHERE professional_id=$1 AND status IN ('completed','settlement_pending','settled')`, [p.id]);
    return { ...a, cancellationRate: p.cancellation_rate, responseMinutes: p.avg_response_minutes, completedJobs: p.completed_jobs };
  }

  /* ---- Self-service business management: every query is scoped to the caller's own profile id ---- */

  @Get('services') async myServices(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    return this.db.query(
      `SELECT ps.id, ps.service_id, s.name, ps.title, ps.description, ps.enabled, ps.duration_minutes, ps.warranty_days,
              COALESCE(json_agg(json_build_object('model', sp.model, 'amount', sp.amount, 'minCharge', sp.min_charge, 'unit', sp.unit_label, 'emergencyAmount', sp.emergency_amount))
                FILTER (WHERE sp.id IS NOT NULL), '[]') AS pricing
         FROM professional_services ps JOIN services s ON s.id=ps.service_id LEFT JOIN service_pricing sp ON sp.professional_service_id=ps.id
        WHERE ps.professional_id=$1 GROUP BY ps.id, s.name ORDER BY s.name`, [p.id]);
  }

  @Get('availability') async availability(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    const weekly = await this.db.query(`SELECT weekday, to_char(start_time,'HH24:MI') AS start, to_char(end_time,'HH24:MI') AS "end" FROM professional_availability WHERE professional_id=$1 ORDER BY weekday, start_time`, [p.id]);
    const timeOff = await this.db.query(`SELECT id, lower(during) AS starts_at, upper(during) AS ends_at, reason FROM professional_time_off WHERE professional_id=$1 AND upper(during) > now() ORDER BY lower(during)`, [p.id]);
    return { weekly, timeOff, autoAccept: p.auto_accept, acceptsEmergency: p.accepts_emergency };
  }
  /** Replaces the weekly schedule atomically. Existing bookings are untouched; the DB exclusion constraint still guards overlaps. */
  @Put('availability') async setAvailability(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ weekly: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).refine((w) => w.end > w.start, 'End must be after start')).max(28) }), b);
    const p = await this.s.mine(u.id);
    await this.db.tx(async (c) => {
      await c.query('DELETE FROM professional_availability WHERE professional_id=$1', [p.id]);
      for (const w of i.weekly) await c.query('INSERT INTO professional_availability (professional_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)', [p.id, w.weekday, w.start, w.end]);
    });
    return { ok: true };
  }
  @Post('time-off') async addTimeOff(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime(), reason: z.string().max(200).optional() }).refine((t) => t.endsAt > t.startsAt, 'End must be after start'), b);
    const p = await this.s.mine(u.id);
    return this.db.one('INSERT INTO professional_time_off (professional_id, during, reason) VALUES ($1, tstzrange($2,$3), $4) RETURNING id', [p.id, i.startsAt, i.endsAt, i.reason ?? null]);
  }
  @Post('time-off/:id/remove') async removeTimeOff(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const p = await this.s.mine(u.id);
    await this.db.query('DELETE FROM professional_time_off WHERE id=$1 AND professional_id=$2', [id, p.id]);
    return { ok: true };
  }
  @Put('preferences') async prefs(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ autoAccept: z.boolean().optional(), acceptsEmergency: z.boolean().optional() }), b);
    const p = await this.s.mine(u.id);
    await this.db.query('UPDATE professional_profiles SET auto_accept=COALESCE($2,auto_accept), accepts_emergency=COALESCE($3,accepts_emergency) WHERE id=$1', [p.id, i.autoAccept ?? null, i.acceptsEmergency ?? null]);
    return { ok: true };
  }

  @Get('portfolio') async portfolio(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    return this.db.query('SELECT id, title, description, media, customer_approved, created_at FROM professional_portfolio WHERE professional_id=$1 ORDER BY created_at DESC', [p.id]);
  }
  @Post('portfolio') async addPortfolio(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ title: z.string().min(2).max(120), description: z.string().max(1000).optional(), categoryId: z.number().int().optional(),
      media: z.array(z.object({ key: z.string(), kind: z.enum(['image', 'video']).default('image'), role: z.enum(['before', 'after', 'gallery']).default('gallery') })).max(12) }), b);
    const p = await this.s.mine(u.id);
    // Uploaded keys are namespaced by owner; refuse keys that point at someone else's files.
    if (i.media.some((m) => !m.key.startsWith(`portfolio/${u.id}/`))) throw new BadRequestException('Invalid media key');
    return this.db.one('INSERT INTO professional_portfolio (professional_id, title, description, category_id, media) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.id, i.title, i.description ?? null, i.categoryId ?? null, JSON.stringify(i.media)]);
  }
  @Post('portfolio/:id/remove') async removePortfolio(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const p = await this.s.mine(u.id);
    await this.db.query('DELETE FROM professional_portfolio WHERE id=$1 AND professional_id=$2', [id, p.id]);
    return { ok: true };
  }

  @Get('reviews') async myReviews(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    return this.db.query(
      `SELECT r.id, r.overall, r.work_quality, r.professionalism, r.punctuality, r.value_for_money, r.communication, r.body, r.created_at,
              split_part(cu.full_name,' ',1) AS reviewer, rr.body AS response
         FROM reviews r JOIN users cu ON cu.id=r.customer_id LEFT JOIN review_responses rr ON rr.review_id=r.id
        WHERE r.professional_id=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 100`, [p.id]);
  }

  /** Customers this professional has worked with. First name only; contact details stay behind active bookings. */
  @Get('customers') async customers(@CurrentUser() u: AuthUser) {
    const p = await this.s.mine(u.id);
    return this.db.query(
      `SELECT cu.id, split_part(cu.full_name,' ',1) AS first_name, count(*) AS jobs, max(b.created_at) AS last_job,
              COALESCE(sum(b.professional_net) FILTER (WHERE b.status IN ('completed','settlement_pending','settled')),0) AS earned
         FROM bookings b JOIN users cu ON cu.id=b.customer_id
        WHERE b.professional_id=$1 AND b.status NOT IN ('draft','pending_payment') GROUP BY cu.id ORDER BY max(b.created_at) DESC LIMIT 200`, [p.id]);
  }

  /** Browser/app uploads straight to B2 with a short-lived signed URL; the API never proxies large media. */
  @Post('uploads') async upload(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ purpose: z.enum(['avatar', 'portfolio', 'document', 'evidence', 'problem']), contentType: z.string().regex(/^(image|video)\/|^application\/pdf$/) }), b);
    const key = `${i.purpose}/${u.id}/${randomUUID()}`;
    return { key, uploadUrl: await this.storage.uploadUrl(key, i.contentType) };
  }
  @Get('uploads/:purpose/:owner/:id') async download(@CurrentUser() u: AuthUser, @Param() p: { purpose: string; owner: string; id: string }) {
    const sensitive = p.purpose === 'document';
    if (sensitive && p.owner !== u.id && !u.perms.includes('verification.review') && !u.perms.includes('*')) throw new ForbiddenException();
    return { url: await this.storage.downloadUrl(`${p.purpose}/${p.owner}/${p.id}`) };
  }
}
