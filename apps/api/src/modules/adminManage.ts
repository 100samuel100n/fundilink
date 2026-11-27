import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Logger, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Audit, Perm, parse } from '../common/core.ts';
import { SAMPLE_VARS, TEMPLATES, TemplateService, tplBuild, unknownVars } from './templates.ts';

const lim = (n: unknown) => Math.min(Math.max(Number(n) || 100, 1), 500);
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  // prefix risky leading characters so spreadsheet apps can't execute cell content (CSV injection)
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\n');
};

/** Remaining admin sections from the blueprint (14.2). Each route is permission-checked; sensitive writes are audited. */
@Controller('admin')
export class AdminManageController {
  constructor(private db: Db, private audit: Audit) {}

  /* ---- Customers / professionals / businesses ---- */
  @Perm('customers.read') @Get('customers')
  customers(@Query('q') q = '', @Query('limit') limit?: string) {
    return this.db.query(`SELECT u.id, u.full_name, u.phone, u.email, u.status, u.created_at,
        (SELECT count(*) FROM bookings b WHERE b.customer_id=u.id)::int bookings,
        (SELECT COALESCE(sum(total),0) FROM bookings b WHERE b.customer_id=u.id AND b.status IN ('completed','settlement_pending','settled'))::bigint spent
      FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='customer'
      WHERE ($1='' OR u.full_name ILIKE '%'||$1||'%' OR u.phone ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%') ORDER BY u.created_at DESC LIMIT $2`, [q, lim(limit)]);
  }
  @Perm('customers.suspend') @Post('customers/:id/status')
  async customerStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().min(5) }), b);
    const prev = await this.db.one<any>('SELECT status FROM users WHERE id=$1', [id]); if (!prev) throw new NotFoundException();
    await this.db.tx(async (c) => {
      await c.query('UPDATE users SET status=$2 WHERE id=$1', [id, i.status]);
      if (i.status === 'suspended') await c.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]).catch(() => undefined);
      await this.audit.log(u, { action: 'customer.status', kind: 'user', id, before: prev, after: i, reason: i.reason, ip: req.ip }, c);
    });
    return { ok: true };
  }
  @Perm('professionals.read') @Get('professionals')
  professionals(@Query('q') q = '', @Query('status') status?: string, @Query('limit') limit?: string) {
    return this.db.query(`SELECT p.id, p.slug, p.display_name, p.business_name, p.account_type, p.county, p.status, p.rating_avg, p.rating_count, p.created_at,
        (SELECT json_agg(DISTINCT v.level) FROM professional_verifications v WHERE v.professional_id=p.id AND v.state='approved') verified_levels,
        (SELECT count(*) FROM bookings b WHERE b.professional_id=p.id AND b.status IN ('completed','settlement_pending','settled'))::int completed
      FROM professional_profiles p WHERE ($1='' OR p.display_name ILIKE '%'||$1||'%' OR p.business_name ILIKE '%'||$1||'%') AND ($2::text IS NULL OR p.status=$2) ORDER BY p.created_at DESC LIMIT $3`, [q, status ?? null, lim(limit)]);
  }
  @Perm('professionals.read') @Get('businesses')
  businesses() {
    return this.db.query(`SELECT p.id, p.display_name, p.business_name, p.county, p.status,
        (SELECT count(*) FROM business_members m WHERE m.business_id=p.id)::int team_size,
        (SELECT json_agg(DISTINCT v.state) FROM professional_verifications v WHERE v.professional_id=p.id AND v.level='business') business_verification
      FROM professional_profiles p WHERE p.account_type='business' ORDER BY p.created_at DESC LIMIT 200`);
  }
  @Perm('professionals.read') @Get('organizations')
  orgs() { return this.db.query(`SELECT o.*, (SELECT count(*) FROM properties p WHERE p.organization_id=o.id)::int properties, (SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id)::int members FROM organizations o ORDER BY created_at DESC LIMIT 200`); }

  /* ---- Categories & services (new categories never need code changes) ---- */
  @Perm('categories.write') @Get('catalogue')
  async catalogue() { return { categories: await this.db.query('SELECT * FROM categories ORDER BY sort_order, name'), services: await this.db.query('SELECT s.*, c.name category FROM services s JOIN categories c ON c.id=s.category_id ORDER BY c.name, s.name') }; }
  @Perm('categories.write') @Post('categories')
  async addCategory(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(CategoryIn, b);
    const r = await this.db.one<any>(`INSERT INTO categories (slug, name, icon, parent_id, requires_license, license_body, risk_level, emergency_capable, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [i.slug, i.name, i.icon ?? null, i.parentId ?? null, i.requiresLicense, i.licenseBody ?? null, i.riskLevel, i.emergencyCapable, i.sortOrder]);
    await this.audit.log(u, { action: 'category.create', kind: 'category', id: String(r.id), after: i });
    return r;
  }
  @Perm('categories.write') @Put('categories/:id')
  async editCategory(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(CategoryIn.partial().extend({ active: z.boolean().optional() }), b);
    const prev = await this.db.one<any>('SELECT * FROM categories WHERE id=$1', [id]); if (!prev) throw new NotFoundException();
    await this.db.query(`UPDATE categories SET name=COALESCE($2,name), icon=COALESCE($3,icon), requires_license=COALESCE($4,requires_license), license_body=COALESCE($5,license_body), risk_level=COALESCE($6,risk_level),
      emergency_capable=COALESCE($7,emergency_capable), sort_order=COALESCE($8,sort_order), active=COALESCE($9,active) WHERE id=$1`,
      [id, i.name ?? null, i.icon ?? null, i.requiresLicense ?? null, i.licenseBody ?? null, i.riskLevel ?? null, i.emergencyCapable ?? null, i.sortOrder ?? null, i.active ?? null]);
    await this.audit.log(u, { action: 'category.update', kind: 'category', id, before: prev, after: i });
    return { ok: true };
  }
  @Perm('categories.write') @Post('services')
  async addService(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ categoryId: z.number().int(), slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2), description: z.string().optional(), keywords: z.array(z.string()).default([]) }), b);
    const r = await this.db.one<any>('INSERT INTO services (category_id, slug, name, description, keywords) VALUES ($1,$2,$3,$4,$5) RETURNING *', [i.categoryId, i.slug, i.name, i.description ?? null, i.keywords]);
    await this.audit.log(u, { action: 'service.create', kind: 'service', id: String(r.id), after: i });
    return r;
  }

  /* ---- Bookings, quotations, projects (read + operational) ---- */
  @Perm('bookings.read') @Get('bookings')
  bookings(@Query('status') status?: string, @Query('q') q = '', @Query('limit') limit?: string) {
    return this.db.query(`SELECT b.id, b.reference, b.kind, b.status, b.total, b.created_at, cu.full_name customer, p.display_name professional, b.address
      FROM bookings b JOIN users cu ON cu.id=b.customer_id JOIN professional_profiles p ON p.id=b.professional_id
      WHERE ($1::text IS NULL OR b.status=$1::booking_status) AND ($2='' OR b.reference ILIKE '%'||$2||'%' OR cu.full_name ILIKE '%'||$2||'%' OR p.display_name ILIKE '%'||$2||'%') ORDER BY b.created_at DESC LIMIT $3`, [status ?? null, q, lim(limit)]);
  }
  @Perm('bookings.read') @Get('bookings/:id/history')
  async history(@Param('id') id: string) { return { history: await this.db.query('SELECT * FROM booking_status_history WHERE booking_id=$1 ORDER BY id', [id]), items: await this.db.query('SELECT * FROM booking_items WHERE booking_id=$1', [id]) }; }
  @Perm('quotations.read') @Get('quotations')
  quotations() { return this.db.query(`SELECT q.id, q.status, q.total, q.submitted_at AS created_at, pr.title project, p.display_name professional FROM quotations q JOIN projects pr ON pr.id=q.project_id JOIN professional_profiles p ON p.id=q.professional_id ORDER BY q.submitted_at DESC NULLS LAST LIMIT 200`); }
  @Perm('projects.read') @Get('projects')
  projects() { return this.db.query(`SELECT pr.id, pr.title, pr.status, pr.budget, pr.created_at, cu.full_name customer, (SELECT count(*) FROM project_milestones m WHERE m.project_id=pr.id)::int milestones FROM projects pr JOIN users cu ON cu.id=pr.customer_id ORDER BY pr.created_at DESC LIMIT 200`); }

  /* ---- Review moderation: negative reviews can't be removed because a pro disagrees; only policy breaches ---- */
  @Perm('reviews.moderate') @Get('reviews')
  reviews(@Query('status') status = 'flagged') { return this.db.query(`SELECT r.id, r.overall, r.body, r.status, r.created_at, p.display_name professional, cu.full_name customer FROM reviews r JOIN professional_profiles p ON p.id=r.professional_id JOIN users cu ON cu.id=r.customer_id WHERE r.status=$1 ORDER BY r.created_at DESC LIMIT 200`, [status]); }
  @Perm('reviews.moderate') @Post('reviews/:id/moderate')
  async moderate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ status: z.enum(['published', 'removed']), reason: z.string().min(10) }), b);
    const prev = await this.db.one<any>('SELECT status FROM reviews WHERE id=$1', [id]); if (!prev) throw new NotFoundException();
    await this.db.query('UPDATE reviews SET status=$2 WHERE id=$1', [id, i.status]);
    await this.audit.log(u, { action: 'review.moderate', kind: 'review', id, before: prev, after: i, reason: i.reason });
    return { ok: true };
  }

  /* ---- Locations / coverage ---- */
  @Perm('locations.write') @Get('locations')
  locations() { return this.db.query(`SELECT l.*, (SELECT count(*) FROM professional_profiles p WHERE p.status='active' AND p.county=l.county)::int active_professionals FROM service_locations l WHERE l.town IS NULL ORDER BY l.county`); }
  @Perm('locations.write') @Put('locations/:id')
  async setLocation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) { const i = parse(z.object({ enabled: z.boolean() }), b); await this.db.query('UPDATE service_locations SET enabled=$2 WHERE id=$1', [id, i.enabled]); await this.audit.log(u, { action: 'location.toggle', kind: 'location', id, after: i }); return { ok: true }; }
  @Perm('locations.write') @Post('locations')
  async addLocation(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ country: z.string().length(2).default('KE'), county: z.string().min(2), town: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() }), b);
    const r = await this.db.one(`INSERT INTO service_locations (country_code, county, town, centre) VALUES ($1,$2,$3, CASE WHEN $4::float IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5,$4),4326)::geography END) ON CONFLICT DO NOTHING RETURNING *`, [i.country.toUpperCase(), i.county, i.town ?? null, i.lat ?? null, i.lng ?? null]);
    await this.audit.log(u, { action: 'location.add', kind: 'location', id: i.county, after: i }); return r;
  }

  /* ---- Promotions ---- */
  @Perm('promotions.write') @Get('promotions')
  promos() { return this.db.query(`SELECT c.*, (SELECT count(*) FROM coupon_redemptions r WHERE r.campaign_id=c.id)::int redemptions FROM promotional_campaigns c ORDER BY c.id DESC LIMIT 200`); }
  @Perm('promotions.write') @Post('promotions')
  async addPromo(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ code: z.string().min(3).max(32).regex(/^[A-Za-z0-9-]+$/), kind: z.enum(['percent', 'fixed', 'credit']), value: z.number().int().positive(), maxRedemptions: z.number().int().positive().optional(), perUserLimit: z.number().int().positive().default(1), endsAt: z.string().datetime().optional() }), b);
    if (i.kind === 'percent' && i.value > 5000) throw new BadRequestException('Percent promos are in basis points (max 50%)');
    const r = await this.db.one(`INSERT INTO promotional_campaigns (code, kind, value, max_redemptions, per_user_limit, ends_at) VALUES (upper($1),$2,$3,$4,$5,$6) RETURNING *`, [i.code, i.kind, i.value, i.maxRedemptions ?? null, i.perUserLimit, i.endsAt ?? null]);
    await this.audit.log(u, { action: 'promotion.create', kind: 'promotion', id: i.code, after: i }); return r;
  }
  @Perm('promotions.write') @Post('promotions/:id/toggle')
  async togglePromo(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.db.query('UPDATE promotional_campaigns SET active = NOT active WHERE id=$1', [id]); await this.audit.log(u, { action: 'promotion.toggle', kind: 'promotion', id }); return { ok: true }; }

  /* ---- Subscriptions & plans ---- */
  @Perm('subscriptions.write') @Get('subscriptions')
  async subs() { return { plans: await this.db.query('SELECT * FROM subscription_plans ORDER BY monthly_amount'), active: await this.db.query(`SELECT s.id, s.plan, s.status, s.current_period_end, p.display_name FROM subscriptions s LEFT JOIN professional_profiles p ON p.id=s.professional_id ORDER BY s.current_period_end DESC LIMIT 200`) }; }
  @Perm('subscriptions.write') @Put('plans/:code')
  async setPlan(@CurrentUser() u: AuthUser, @Param('code') code: string, @Body() b: unknown) {
    const i = parse(z.object({ monthlyAmount: z.number().int().nonnegative(), features: z.record(z.any()).optional(), reason: z.string().min(5) }), b);
    const prev = await this.db.one('SELECT * FROM subscription_plans WHERE code=$1::plan_code', [code]);
    await this.db.query('UPDATE subscription_plans SET monthly_amount=$2, features=COALESCE($3, features) WHERE code=$1::plan_code', [code, i.monthlyAmount, i.features ?? null]);
    await this.audit.log(u, { action: 'plan.change', kind: 'subscription_plan', id: code, before: prev, after: i, reason: i.reason }); return { ok: true };
  }
  @Perm('subscriptions.write') @Get('activation-payments')
  activations() { return this.db.query(`SELECT ap.*, p.display_name, pi.amount FROM activation_payments ap JOIN professional_profiles p ON p.id=ap.professional_id LEFT JOIN payment_intents pi ON pi.id=ap.payment_intent_id ORDER BY ap.paid_at DESC NULLS LAST LIMIT 200`); }

  /* ---- Roles & access control ---- */
  @Perm('roles.write') @Get('roles')
  async roles() { return { roles: await this.db.query(`SELECT r.code, r.description, COALESCE(json_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),'[]') permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id GROUP BY r.code, r.description ORDER BY r.code`), permissions: await this.db.query(`SELECT code FROM permissions WHERE code<>'*' ORDER BY code`) }; }
  @Perm('roles.write') @Put('roles/:code/permissions')
  async setRolePerms(@CurrentUser() u: AuthUser, @Param('code') code: string, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ permissions: z.array(z.string()), reason: z.string().min(5) }), b);
    if (['super_admin', 'customer', 'professional'].includes(code)) throw new ForbiddenException('This role is fixed');
    if (i.permissions.includes('*')) throw new ForbiddenException('The wildcard permission cannot be assigned');
    const before = await this.db.query(`SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code=$1`, [code]);
    await this.db.tx(async (c) => {
      await c.query('DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code=$1)', [code]);
      await c.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT (SELECT id FROM roles WHERE code=$1), id FROM permissions WHERE code = ANY($2)`, [code, i.permissions]);
      await this.audit.log(u, { action: 'role.permissions', kind: 'role', id: code, before: before.map((x: any) => x.code), after: i.permissions, reason: i.reason, ip: req.ip }, c);
    });
    return { ok: true, note: 'Takes effect when staff next sign in or refresh their session.' };
  }
  @Perm('roles.write') @Get('staff')
  staff() { return this.db.query(`SELECT u.id, u.full_name, u.email, u.phone, u.status, json_agg(r.code) roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code NOT IN ('customer','professional','business_member','org_member') GROUP BY u.id ORDER BY u.full_name`); }
  @Perm('roles.write') @Post('staff/grant')
  async grant(@CurrentUser() u: AuthUser, @Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ identifier: z.string().min(3), role: z.string(), revoke: z.boolean().default(false), reason: z.string().min(5) }), b);
    if (i.role === 'super_admin' && !u.perms.includes('*')) throw new ForbiddenException('Only a super admin can grant super admin');
    const t = await this.db.one<any>('SELECT id FROM users WHERE phone=$1 OR email=$1', [i.identifier]); if (!t) throw new NotFoundException('No such user');
    if (t.id === u.id && i.revoke) throw new ForbiddenException('You cannot remove your own role');
    await this.db.tx(async (c) => {
      if (i.revoke) await c.query('DELETE FROM user_roles WHERE user_id=$1 AND role_id=(SELECT id FROM roles WHERE code=$2)', [t.id, i.role]);
      else await c.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code=$2 ON CONFLICT DO NOTHING', [t.id, i.role]);
      await this.audit.log(u, { action: i.revoke ? 'role.revoke' : 'role.grant', kind: 'user', id: t.id, after: { role: i.role }, reason: i.reason, ip: req.ip }, c);
    });
    return { ok: true };
  }

  /* ---- CMS ---- */
  @Perm('content.publish') @Get('content')
  content() { return this.db.query('SELECT * FROM content_pages ORDER BY kind, slug'); }
  @Perm('content.publish') @Put('content/:slug')
  async saveContent(@CurrentUser() u: AuthUser, @Param('slug') slug: string, @Body() b: unknown) {
    const i = parse(z.object({ kind: z.enum(['page', 'article', 'testimonial', 'banner', 'faq']).default('page'), title: z.string().min(2), body: z.string(), published: z.boolean(), meta: z.record(z.any()).default({}) }), b);
    const r = await this.db.one(`INSERT INTO content_pages (slug, kind, title, body, published, meta, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (slug) DO UPDATE SET kind=EXCLUDED.kind, title=EXCLUDED.title, body=EXCLUDED.body, published=EXCLUDED.published, meta=EXCLUDED.meta, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`, [slug, i.kind, i.title, i.body, i.published, i.meta, u.id]);
    await this.audit.log(u, { action: 'content.save', kind: 'content', id: slug, after: { title: i.title, published: i.published } }); return r;
  }

  /* ---- Support desk + reports ---- */
  @Perm('support.manage') @Get('tickets')
  tickets(@Query('status') status = 'open') { return this.db.query(`SELECT t.*, u.full_name requester, (SELECT body FROM support_messages m WHERE m.ticket_id=t.id ORDER BY id DESC LIMIT 1) last_message FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.status=$1 ORDER BY (t.priority='urgent') DESC, t.updated_at LIMIT 200`, [status]); }
  @Perm('support.manage') @Get('tickets/:id')
  async ticket(@Param('id') id: string) { const t = await this.db.one('SELECT * FROM support_tickets WHERE id=$1', [id]); if (!t) throw new NotFoundException(); return { ...t, messages: await this.db.query('SELECT * FROM support_messages WHERE ticket_id=$1 ORDER BY id', [id]) }; }
  @Perm('support.manage') @Post('tickets/:id/reply')
  async answer(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ body: z.string().min(1), status: z.enum(['pending_user', 'resolved', 'closed', 'open']).default('pending_user') }), b);
    const t = await this.db.one<any>('SELECT user_id FROM support_tickets WHERE id=$1', [id]); if (!t) throw new NotFoundException();
    const tp = await tplBuild('support_reply', { message: i.body.slice(0, 140) });
    await this.db.tx(async (c) => {
      await c.query('INSERT INTO support_messages (ticket_id, author_id, staff, body) VALUES ($1,$2,true,$3)', [id, u.id, i.body]);
      await c.query('UPDATE support_tickets SET status=$2, assigned_to=COALESCE(assigned_to,$3), updated_at=now() WHERE id=$1', [id, i.status, u.id]);
      await c.query(`INSERT INTO notifications (user_id, template, title, body, data, channels) VALUES ($1,'support_reply',$2,$3,$4,'{in_app,push,email}')`, [t.user_id, tp?.title ?? 'Support replied', tp?.body ?? i.body.slice(0, 140), JSON.stringify({ ticketId: id })]);
    });
    return { ok: true };
  }
  @Perm('support.manage') @Get('reports')
  reports() { return this.db.query(`SELECT r.*, u.full_name reporter FROM reports r JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.created_at LIMIT 200`); }
  @Perm('support.manage') @Post('reports/:id/resolve')
  async resolveReport(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) { const i = parse(z.object({ note: z.string().min(3) }), b); await this.db.query(`UPDATE reports SET status='resolved' WHERE id=$1`, [id]); await this.audit.log(u, { action: 'report.resolve', kind: 'report', id, reason: i.note }); return { ok: true }; }
  @Perm('equipment.moderate') @Get('equipment')
  equipment() { return this.db.query(`SELECT e.*, p.display_name owner FROM equipment_listings e JOIN professional_profiles p ON p.id=e.professional_id ORDER BY e.created_at DESC LIMIT 200`); }

  /* ---- Rich analytics for the overview charts ---- */
  @Perm('analytics.read') @Get('analytics')
  async analytics() {
    // Each chart is isolated: one failing query leaves that chart empty instead of failing the whole page, and the log names it.
    const run = (label: string, sql: string) => this.db.query<any>(sql).catch((e: any) => { new Logger('Analytics').error(`"${label}" query failed: ${e?.message ?? e}`); return [] as any[]; });
    const done = `('completed','settlement_pending','settled')`;
    const [revenue, signups, profitable, cancel, conv, ret, pret, resp, liquidity] = await Promise.all([
      run('revenue', `SELECT date_trunc('month', b.created_at)::date AS month, COALESCE(sum(b.commission+b.customer_fee) FILTER (WHERE b.status IN ${done}),0)::bigint AS revenue, count(*)::int AS bookings FROM bookings b WHERE b.created_at > now()-interval '12 months' GROUP BY 1 ORDER BY 1`),
      run('signups', `SELECT date_trunc('month', u.created_at)::date AS month, count(*) FILTER (WHERE r.code='customer')::int AS customers, count(*) FILTER (WHERE r.code='professional')::int AS professionals FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.created_at > now()-interval '12 months' GROUP BY 1 ORDER BY 1`),
      run('profitable', `SELECT c.name AS category, COALESCE(sum(b.commission+b.customer_fee),0)::bigint AS revenue, count(*)::int AS bookings FROM bookings b JOIN professional_services ps ON ps.id=b.professional_service_id JOIN services s ON s.id=ps.service_id JOIN categories c ON c.id=s.category_id WHERE b.status IN ${done} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`),
      run('cancel', `SELECT date_trunc('week', created_at)::date AS week, round(100.0*count(*) FILTER (WHERE status='cancelled')/NULLIF(count(*),0),1) AS cancel_pct FROM bookings WHERE created_at > now()-interval '12 weeks' GROUP BY 1 ORDER BY 1`),
      run('funnel', `SELECT (SELECT count(*) FROM search_events WHERE created_at > now()-interval '30 days')::int AS searches, (SELECT count(*) FROM bookings WHERE status IN ${done} AND created_at > now()-interval '30 days')::int AS completed`),
      run('repeat', `WITH c AS (SELECT customer_id, count(*) AS n FROM bookings WHERE status IN ${done} GROUP BY 1) SELECT round(100.0*count(*) FILTER (WHERE n>1)/NULLIF(count(*),0),1) AS customer_repeat_pct FROM c`),
      run('pro-active', `SELECT round(100.0*count(DISTINCT professional_id) FILTER (WHERE created_at > now()-interval '30 days')/NULLIF(count(DISTINCT professional_id),0),1) AS professional_active_30d_pct FROM bookings`),
      run('acceptance', `SELECT round(100.0*count(*) FILTER (WHERE status NOT IN ('declined','cancelled') OR status IS NULL)/NULLIF(count(*),0),1) AS request_acceptance_pct FROM bookings WHERE status NOT IN ('draft','pending_payment')`),
      run('liquidity', `SELECT county, count(*)::int AS active_professionals FROM professional_profiles WHERE status='active' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`),
    ]);
    const f = conv[0] ?? { searches: 0, completed: 0 };
    return { revenue, signups, profitable, cancel, funnel: { ...f, searchToBookingPct: f.searches ? Number(((f.completed / f.searches) * 100).toFixed(1)) : 0 }, retention: { ...(ret[0] ?? {}), ...(pret[0] ?? {}) }, requestAcceptance: resp[0] ?? {}, liquidity };
  }

  /* ---- Notification templates: the catalogue of every message the platform sends, with admin-editable wording ---- */
  @Perm('settings.write') @Get('templates')
  async templates() {
    const rows = await this.db.query<any>(`SELECT key, value FROM platform_settings WHERE key LIKE 'template.%'`);
    const overrides: Record<string, { title?: string; body?: string; sms?: string }> = {};
    for (const r of rows) overrides[String(r.key).slice('template.'.length)] = typeof r.value === 'string' ? { body: r.value } : r.value;
    return { templates: TEMPLATES, overrides, sample: SAMPLE_VARS };
  }

  @Perm('settings.write') @Put('templates/:key')
  async setTemplate(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() b: unknown, @Req() req: any) {
    const def = TEMPLATES.find((t) => t.key === key);
    if (!def) throw new NotFoundException('Unknown template');
    const i = parse(z.object({ title: z.string().min(2).max(120), body: z.string().min(2).max(600), sms: z.string().max(300).optional(), reason: z.string().min(5) }), b);
    const bad = [...new Set([...unknownVars(i.title, def.vars), ...unknownVars(i.body, def.vars), ...unknownVars(i.sms ?? '', def.vars)])];
    if (bad.length) throw new BadRequestException(`Unknown placeholder ${bad.map((x) => `{{${x}}}`).join(', ')}. Available here: ${def.vars.length ? def.vars.map((x) => `{{${x}}}`).join(', ') : 'none'}.`);
    const prev = await this.db.one('SELECT value FROM platform_settings WHERE key=$1', [`template.${key}`]);
    await this.db.query(`INSERT INTO platform_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [`template.${key}`, JSON.stringify({ title: i.title, body: i.body, sms: i.sms })]);
    await this.audit.log(u, { action: 'template.change', kind: 'notification_template', id: key, before: prev, after: { title: i.title, body: i.body, sms: i.sms }, reason: i.reason, ip: req.ip });
    TemplateService.instance?.clear(key);
    return { ok: true };
  }

  @Perm('settings.write') @Put('templates/:key/reset')
  async resetTemplate(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() b: unknown, @Req() req: any) {
    if (!TEMPLATES.some((t) => t.key === key)) throw new NotFoundException('Unknown template');
    const i = parse(z.object({ reason: z.string().min(5) }), b);
    const prev = await this.db.one('SELECT value FROM platform_settings WHERE key=$1', [`template.${key}`]);
    await this.db.query('DELETE FROM platform_settings WHERE key=$1', [`template.${key}`]);
    await this.audit.log(u, { action: 'template.reset', kind: 'notification_template', id: key, before: prev, after: null, reason: i.reason, ip: req.ip });
    TemplateService.instance?.clear(key);
    return { ok: true };
  }

  /* ---- Settings and exports (exports are audited) ---- */
  @Perm('settings.write') @Get('settings')
  settings() { return this.db.query('SELECT key, value, country_code, updated_at FROM platform_settings ORDER BY key'); }
  @Perm('settings.write') @Put('settings/:key')
  async setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() b: unknown) {
    const i = parse(z.object({ value: z.any(), reason: z.string().min(5) }), b);
    if (!/^[a-z0-9_.-]+$/.test(key)) throw new BadRequestException('Bad key');
    const prev = await this.db.one('SELECT value FROM platform_settings WHERE key=$1', [key]);
    await this.db.query(`INSERT INTO platform_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [key, JSON.stringify(i.value)]);
    await this.audit.log(u, { action: 'setting.change', kind: 'platform_setting', id: key, before: prev, after: i.value, reason: i.reason }); return { ok: true };
  }
  @Perm('data.export') @Get('export/:kind') @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Req() req: any) {
    const q: Record<string, string> = {
      bookings: `SELECT reference, kind, status, total, commission, professional_net, created_at FROM bookings ORDER BY created_at DESC LIMIT 50000`,
      transactions: `SELECT t.id, t.kind, t.created_at, e.account, e.debit, e.credit FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id=t.id ORDER BY t.id DESC LIMIT 100000`,
      customers: `SELECT u.id, u.full_name, u.phone, u.email, u.created_at FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='customer' LIMIT 50000`,
    };
    if (!q[kind]) throw new BadRequestException('Unknown export');
    if (kind === 'customers' && !u.perms.includes('*') && !u.perms.includes('customers.read')) throw new ForbiddenException('Missing customers.read');
    const rows = await this.db.query(q[kind]);
    await this.audit.log(u, { action: 'data.export', kind: 'export', id: kind, after: { rows: rows.length }, ip: req.ip, device: req.headers['user-agent'] });
    return csv(rows);
  }
}

const CategoryIn = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2), icon: z.string().optional(), parentId: z.number().int().optional(), requiresLicense: z.boolean().default(false), licenseBody: z.string().optional(), riskLevel: z.number().int().min(1).max(3).default(1), emergencyCapable: z.boolean().default(false), sortOrder: z.number().int().default(100) });