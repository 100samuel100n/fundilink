import { Controller, Get, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Candidate, DEFAULT_WEIGHTS, rank, Weights } from '@fundilink/domain';
import { Db, Public, parse } from '../common/core.ts';

const SearchQ = z.object({
  q: z.string().trim().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).default(10),
  category: z.string().optional(),            // slug
  minRating: z.coerce.number().min(0).max(5).default(0),
  verifiedOnly: z.coerce.boolean().default(false),
  availableNow: z.coerce.boolean().default(false),
  minYears: z.coerce.number().default(0),
  businessType: z.enum(['individual', 'business']).optional(),
  language: z.string().optional(),
  pricing: z.enum(['fixed', 'hourly', 'daily', 'call_out', 'per_unit', 'per_sqm', 'project', 'quotation', 'recurring']).optional(),
  sort: z.enum(['recommended', 'nearest', 'rating', 'experience', 'price', 'earliest', 'jobs']).default('recommended'),
  limit: z.coerce.number().min(1).max(50).default(24),
});

@Injectable()
export class DiscoveryService {
  constructor(private db: Db) {}

  async weights(): Promise<Weights> {
    const r = await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='ranking.weights'`);
    return r?.value ?? DEFAULT_WEIGHTS;
  }

  /** Search by profession ("plumber"), by problem ("leaking pipe"), by category slug, or by business name. */
  async resolveIntent(q?: string, categorySlug?: string) {
    if (categorySlug) {
      const c = await this.db.one<any>('SELECT id FROM categories WHERE slug=$1', [categorySlug]);
      return { categoryId: c?.id as number | undefined, serviceIds: [] as number[] };
    }
    if (!q) return { categoryId: undefined, serviceIds: [] as number[] };
    const svc = await this.db.query<any>(
      `SELECT id, category_id, GREATEST(similarity(name,$1), (SELECT COALESCE(MAX(similarity(k,$1)),0) FROM unnest(keywords) k)) AS sim
       FROM services WHERE name ILIKE '%'||$1||'%' OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE $1 ILIKE '%'||k||'%' OR k ILIKE '%'||$1||'%') OR similarity(name,$1) > 0.25
       ORDER BY sim DESC LIMIT 5`, [q]);
    const cat = await this.db.one<any>(`SELECT id FROM categories WHERE name ILIKE '%'||$1||'%' OR slug ILIKE '%'||$1||'%' ORDER BY similarity(name,$1) DESC LIMIT 1`, [q]);
    return { categoryId: svc[0]?.category_id ?? cat?.id, serviceIds: svc.map((s) => s.id as number) };
  }

  async search(p: z.infer<typeof SearchQ>) {
    const intent = await this.resolveIntent(p.q, p.category);
    const hasGeo = p.lat != null && p.lng != null;

    // One query builder so every filter applies identically with or without GPS.
    const params: any[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const where: string[] = [`pp.status='active'`, `pp.searchable`];
    let dist = '0::float8';
    if (hasGeo) {
      const pt = `ST_SetSRID(ST_MakePoint(${add(p.lng)},${add(p.lat)}),4326)::geography`;
      dist = `(ST_Distance(pp.base_location, ${pt}) / 1000.0)`;
      where.push(`ST_DWithin(pp.base_location, ${pt}, ${add(p.radiusKm * 1000)})`, `${dist} <= pp.max_travel_km`);
    }
    if (intent.categoryId !== undefined) where.push(`EXISTS (SELECT 1 FROM professional_categories pc WHERE pc.professional_id=pp.id AND pc.category_id=${add(intent.categoryId)})`);
    else if (p.q) { const like = add(`%${p.q}%`); where.push(`(pp.display_name ILIKE ${like} OR pp.business_name ILIKE ${like})`); }
    if (p.minRating > 0) where.push(`(pp.rating_count = 0 OR pp.rating_avg >= ${add(p.minRating)})`); // newcomers aren't hidden by a rating floor
    if (p.verifiedOnly) where.push(`EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pp.id AND v.level='identity' AND v.state='approved')`);
    if (p.minYears > 0) where.push(`COALESCE(pp.years_experience,0) >= ${add(p.minYears)}`);
    if (p.businessType) where.push(`pp.account_type = ${add(p.businessType)}::account_type`);
    if (p.language) where.push(`${add(p.language)} = ANY(pp.languages)`);
    const pricingClause = p.pricing ? `AND sp.model = ${add(p.pricing)}::pricing_model` : '';
    if (p.pricing) where.push(`EXISTS (SELECT 1 FROM professional_services ps JOIN service_pricing sp ON sp.professional_service_id=ps.id WHERE ps.professional_id=pp.id AND ps.enabled ${pricingClause})`);
    const svcIds = add(intent.serviceIds);

    const rows = await this.db.query<any>(
      `SELECT pp.*, ${dist} AS distance_km,
         EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pp.id AND v.level='identity' AND v.state='approved') AS identity_verified,
         EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pp.id AND v.level='qualification' AND v.state='approved') AS qualification_verified,
         EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pp.id AND v.level='business' AND v.state='approved') AS business_verified,
         (SELECT MIN(sp.amount) FROM professional_services ps JOIN service_pricing sp ON sp.professional_service_id=ps.id
            WHERE ps.professional_id=pp.id AND ps.enabled AND sp.amount IS NOT NULL ${pricingClause}) AS starting_price,
         (SELECT count(*) FROM professional_services ps WHERE ps.professional_id=pp.id AND ps.enabled AND ps.service_id = ANY(${svcIds}::int[])) AS svc_matches,
         ST_Y(pp.base_location::geometry) AS lat0, ST_X(pp.base_location::geometry) AS lng0,
         NOT EXISTS (SELECT 1 FROM bookings b WHERE b.professional_id=pp.id AND b.scheduled_during @> now()
            AND b.status IN ('confirmed','scheduled','en_route','arrived','in_progress')) AS free_now
       FROM professional_profiles pp
       WHERE ${where.join(' AND ')}
       LIMIT 200`,
      params,
    );

    const prices = rows.map((r) => Number(r.starting_price)).filter((x) => x > 0).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : 150_000;
    const view = (r: any) => ({
      id: r.id, slug: r.slug, name: r.display_name, businessName: r.business_name, logoUrl: r.logo_url, headline: r.headline,
      accountType: r.account_type, county: r.county, area: r.base_area,
      verification: { identity: r.identity_verified, qualification: r.qualification_verified, business: r.business_verified },
      rating: Number(r.rating_avg), reviews: r.rating_count, completedJobs: r.completed_jobs, yearsExperience: r.years_experience,
      startingPrice: r.starting_price ? Number(r.starting_price) : null, distanceKm: hasGeo ? Number(Number(r.distance_km).toFixed(1)) : null,
      availableNow: r.free_now, acceptsEmergency: r.accepts_emergency, responseMinutes: r.avg_response_minutes, languages: r.languages, newcomer: r.completed_jobs < 5,
      // privacy: never the real base point, only a coarse map pin (rounded to ~1 km)
      mapPin: { lat: Math.round(r.lat0 * 100) / 100, lng: Math.round(r.lng0 * 100) / 100 },
    });

    const candidates: (Candidate & { raw: any })[] = rows.map((r) => ({
      id: r.id, raw: r, distanceKm: hasGeo ? Number(r.distance_km) : 0, serviceRadiusKm: Number(r.max_travel_km),
      specialisationMatch: intent.serviceIds.length ? (Number(r.svc_matches) > 0 ? 1 : 0.55) : 0.8,
      availableNow: r.free_now, hoursUntilNextSlot: r.free_now ? 0 : 24,
      avgRating: Number(r.rating_avg), reviewCount: r.rating_count, completedJobs: r.completed_jobs, completionRate: Number(r.completion_rate) || 0.9,
      cancellationRate: Number(r.cancellation_rate), avgResponseMinutes: r.avg_response_minutes, startingPrice: Number(r.starting_price ?? median),
      verifiedIdentity: r.identity_verified,
    }));

    let ordered: any[];
    const w = await this.weights();
    switch (p.sort) {
      case 'nearest': ordered = [...candidates].sort((a, b) => a.distanceKm - b.distanceKm); break;
      case 'rating': ordered = [...candidates].sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount); break;
      case 'experience': ordered = [...candidates].sort((a, b) => (b.raw.years_experience ?? 0) - (a.raw.years_experience ?? 0)); break;
      case 'price': ordered = [...candidates].sort((a, b) => a.startingPrice - b.startingPrice); break;
      case 'earliest': ordered = [...candidates].sort((a, b) => a.hoursUntilNextSlot - b.hoursUntilNextSlot); break;
      case 'jobs': ordered = [...candidates].sort((a, b) => b.completedJobs - a.completedJobs); break;
      default: ordered = rank(candidates, { marketMedianPrice: median }, w).map((r) => candidates.find((c) => c.id === r.candidate.id)!);
    }
    if (p.availableNow) ordered = ordered.filter((c) => c.availableNow);

    const sponsored = intent.categoryId
      ? await this.db.query<any>(`SELECT professional_id FROM sponsored_placements WHERE category_id=$1 AND now() BETWEEN starts_at AND ends_at LIMIT 2`, [intent.categoryId])
      : [];
    await this.db.query(`INSERT INTO search_events (query, category_id, location, filters, result_count) VALUES ($1,$2, ${hasGeo ? 'ST_SetSRID(ST_MakePoint($3,$4),4326)::geography' : 'NULL'}, $5, $6)`,
      hasGeo ? [p.q ?? null, intent.categoryId ?? null, p.lng, p.lat, JSON.stringify(p), ordered.length] : [p.q ?? null, intent.categoryId ?? null, null, null, JSON.stringify(p), ordered.length]).catch(() => {});

    return {
      intent: { categoryId: intent.categoryId ?? null },
      total: ordered.length,
      results: ordered.slice(0, p.limit).map((c) => view(c.raw)),
      // sponsored slots are labelled and kept apart from organic ranking
      sponsored: sponsored.map((s) => s.professional_id),
    };
  }

  async profile(slug: string) {
    const p = await this.db.one<any>(`SELECT *, ST_Y(base_location::geometry) lat, ST_X(base_location::geometry) lng FROM professional_profiles WHERE slug=$1 AND status='active' AND searchable`, [slug]);
    if (!p) throw new NotFoundException();
    const [services, reviews, portfolio, quals, areas, ver, breakdown] = await Promise.all([
      this.db.query(`SELECT ps.id, s.name, ps.description, ps.duration_minutes, ps.warranty_days, json_agg(json_build_object('model', sp.model, 'amount', sp.amount, 'min', sp.min_charge, 'unit', sp.unit_label, 'emergency', sp.emergency_amount)) pricing
        FROM professional_services ps JOIN services s ON s.id=ps.service_id LEFT JOIN service_pricing sp ON sp.professional_service_id=ps.id WHERE ps.professional_id=$1 AND ps.enabled GROUP BY ps.id, s.name`, [p.id]),
      this.db.query(`SELECT r.overall, r.work_quality, r.professionalism, r.punctuality, r.value_for_money, r.communication, r.body, r.created_at, u.full_name AS reviewer, true AS verified_booking, rr.body AS response
        FROM reviews r JOIN users u ON u.id=r.customer_id LEFT JOIN review_responses rr ON rr.review_id=r.id WHERE r.professional_id=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30`, [p.id]),
      this.db.query('SELECT id,title,description,media FROM professional_portfolio WHERE professional_id=$1 ORDER BY created_at DESC LIMIT 30', [p.id]),
      this.db.query('SELECT kind,title,issuer FROM professional_qualifications WHERE professional_id=$1', [p.id]),
      this.db.query('SELECT county,town,estate FROM professional_service_areas WHERE professional_id=$1', [p.id]),
      this.db.query(`SELECT level, state FROM professional_verifications WHERE professional_id=$1 AND state='approved'`, [p.id]),
      this.db.one(`SELECT round(avg(overall),2) overall, round(avg(work_quality),2) work_quality, round(avg(professionalism),2) professionalism, round(avg(punctuality),2) punctuality, round(avg(value_for_money),2) value_for_money, round(avg(communication),2) communication FROM reviews WHERE professional_id=$1 AND status='published'`, [p.id]),
    ]);
    return {
      id: p.id, slug: p.slug, name: p.display_name, businessName: p.business_name, headline: p.headline, bio: p.bio, logoUrl: p.logo_url, memberSince: p.created_at,
      accountType: p.account_type, yearsExperience: p.years_experience, languages: p.languages, county: p.county, area: p.base_area,
      stats: { rating: Number(p.rating_avg), reviews: p.rating_count, completedJobs: p.completed_jobs, completionRate: Number(p.completion_rate), cancellationRate: Number(p.cancellation_rate), responseMinutes: p.avg_response_minutes },
      travel: { freeRadiusKm: Number(p.free_radius_km), maxTravelKm: Number(p.max_travel_km), perKm: Number(p.per_km_amount), minCallOut: Number(p.min_call_out) },
      paymentModes: await this.paymentModes(p), acceptsEmergency: p.accepts_emergency, verification: ver.map((v: any) => v.level), services, reviews, ratingBreakdown: breakdown, portfolio, qualifications: quals, serviceAreas: areas,
      mapPin: { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 },
    };
  }

  /** Which payment models the customer is offered. Pay-on-site needs the pro's opt-in AND a funded wallet (their balance is never revealed). */
  async paymentModes(p: any): Promise<('escrow' | 'direct')[]> {
    const flag = async (k: string) => { const r = await this.db.one<any>('SELECT value FROM platform_settings WHERE key=$1', [k]); return r ? r.value === true || r.value === 'true' : true; };
    const out: ('escrow' | 'direct')[] = [];
    if (p.accepts_escrow_payment !== false && (await flag('payments.escrow_enabled'))) out.push('escrow');
    if (p.accepts_direct_payment !== false && (await flag('payments.direct_enabled'))) {
      const bal = await this.db.one<any>(`SELECT COALESCE(SUM(credit)-SUM(debit),0)::bigint b FROM ledger_entries WHERE account=$1`, [`PRO_WALLET:${p.id}`]);
      const min = await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='wallet.min_balance_minor'`);
      if (Number(bal?.b ?? 0) > Number(min?.value ?? 0) + 20_000) out.push('direct'); // enough to cover a typical commission
    }
    return out.length ? out : ['escrow'];
  }

  /** Up to three professionals side-by-side. */
  async compare(ids: string[]) {
    const rows = await this.db.query<any>(
      `SELECT pp.id, pp.slug, pp.display_name name, pp.rating_avg, pp.rating_count, pp.completed_jobs, pp.years_experience, pp.avg_response_minutes, pp.max_travel_km, pp.accepts_emergency,
        (SELECT MIN(sp.amount) FROM professional_services ps JOIN service_pricing sp ON sp.professional_service_id=ps.id WHERE ps.professional_id=pp.id AND sp.amount IS NOT NULL) starting_price,
        (SELECT json_agg(level) FROM professional_verifications v WHERE v.professional_id=pp.id AND v.state='approved') verification,
        (SELECT json_agg(title) FROM professional_qualifications q WHERE q.professional_id=pp.id) qualifications
       FROM professional_profiles pp WHERE pp.id = ANY($1::uuid[]) AND pp.status='active' LIMIT 3`, [ids.slice(0, 3)]);
    return rows;
  }
}

@Controller('discover')
export class DiscoveryController {
  constructor(private s: DiscoveryService, private db: Db) {}
  @Public() @Get('search') search(@Query() q: unknown) { return this.s.search(parse(SearchQ, q)); }
  @Public() @Get('categories') categories() { return this.db.query(`SELECT c.id, c.slug, c.name, c.icon, c.requires_license, c.emergency_capable,
      (SELECT json_agg(json_build_object('id', s.id, 'slug', s.slug, 'name', s.name)) FROM services s WHERE s.category_id=c.id) services FROM categories c WHERE c.active ORDER BY c.sort_order`); }
  @Public() @Get('compare') compare(@Query('ids') ids: string) { return this.s.compare((ids ?? '').split(',').filter(Boolean)); }
  @Public() @Get('professionals/:slug') profile(@Param('slug') slug: string) { return this.s.profile(slug); }
}
