import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, parse } from '../common/core.ts';

@Injectable()
export class EnterpriseService {
  constructor(private db: Db) {}
  async role(orgId: string, userId: string) {
    const m = await this.db.one<any>('SELECT role, spend_limit FROM organization_members WHERE organization_id=$1 AND user_id=$2', [orgId, userId]);
    if (!m) throw new ForbiddenException();
    return m as { role: 'owner' | 'manager' | 'approver' | 'requester' | 'viewer'; spend_limit: string | null };
  }
}

@Controller('enterprise')
export class EnterpriseController {
  constructor(private s: EnterpriseService, private db: Db) {}

  @Post('organizations') async create(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ name: z.string().min(2), kind: z.string().optional(), registrationNo: z.string().optional(), billingEmail: z.string().email().optional() }), b);
    const org = await this.db.one<any>('INSERT INTO organizations (name, kind, registration_no, billing_email) VALUES ($1,$2,$3,$4) RETURNING *', [i.name, i.kind ?? null, i.registrationNo ?? null, i.billingEmail ?? null]);
    await this.db.query(`INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1,$2,'owner')`, [org.id, u.id]);
    await this.db.query(`INSERT INTO user_roles SELECT $1, id FROM roles WHERE code='org_member' ON CONFLICT DO NOTHING`, [u.id]);
    return org;
  }
  @Get('organizations') mine(@CurrentUser() u: AuthUser) { return this.db.query('SELECT o.*, m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1', [u.id]); }

  @Post('organizations/:id/properties') async addProperty(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const m = await this.s.role(id, u.id); if (!['owner', 'manager'].includes(m.role)) throw new ForbiddenException();
    const i = parse(z.object({ name: z.string(), address: z.string(), lat: z.number().optional(), lng: z.number().optional(), units: z.array(z.object({ building: z.string().optional(), label: z.string() })).default([]) }), b);
    const p = await this.db.one<any>(`INSERT INTO properties (organization_id, name, address, location) VALUES ($1,$2,$3, ${i.lat != null ? 'ST_SetSRID(ST_MakePoint($5,$4),4326)::geography' : 'NULL'}) RETURNING *`,
      i.lat != null ? [id, i.name, i.address, i.lat, i.lng] : [id, i.name, i.address]);
    for (const un of i.units) await this.db.query('INSERT INTO property_units (property_id, building, unit_label) VALUES ($1,$2,$3)', [p.id, un.building ?? null, un.label]);
    return p;
  }
  @Get('organizations/:id/properties') async properties(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.s.role(id, u.id);
    return this.db.query(`SELECT p.*, (SELECT count(*) FROM property_units WHERE property_id=p.id) units, (SELECT count(*) FROM maintenance_requests r WHERE r.property_id=p.id AND r.status NOT IN ('done','rejected')) open_requests FROM properties p WHERE organization_id=$1`, [id]);
  }

  /** Requests above the requester's spend limit automatically go to an approver; below it they proceed. */
  @Post('organizations/:id/requests') async request(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const m = await this.s.role(id, u.id); if (m.role === 'viewer') throw new ForbiddenException();
    const i = parse(z.object({ propertyId: z.string().uuid(), unitId: z.string().uuid().optional(), categoryId: z.number().int(), title: z.string().min(3), description: z.string().optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), estimatedCost: z.number().int().nonnegative().optional() }), b);
    const needsApproval = m.spend_limit != null && (i.estimatedCost ?? 0) > Number(m.spend_limit) && !['owner', 'approver'].includes(m.role);
    return this.db.one(`INSERT INTO maintenance_requests (organization_id, property_id, unit_id, reported_by, category_id, title, description, priority, estimated_cost, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [id, i.propertyId, i.unitId ?? null, u.id, i.categoryId, i.title, i.description ?? null, i.priority, i.estimatedCost ?? null, needsApproval ? 'awaiting_approval' : 'approved']);
  }
  @Post('requests/:id/approve') async approve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.db.one<any>('SELECT * FROM maintenance_requests WHERE id=$1', [id]);
    if (!r) throw new BadRequestException();
    const m = await this.s.role(r.organization_id, u.id);
    if (!['owner', 'approver'].includes(m.role)) throw new ForbiddenException('Only approvers can approve spend');
    if (r.reported_by === u.id && m.role !== 'owner') throw new ForbiddenException('Approve someone else\'s request');
    await this.db.query(`UPDATE maintenance_requests SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1 AND status='awaiting_approval'`, [id, u.id]);
    return { ok: true };
  }
  @Get('organizations/:id/requests') async requests(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.s.role(id, u.id); return this.db.query('SELECT r.*, p.name property FROM maintenance_requests r JOIN properties p ON p.id=r.property_id WHERE r.organization_id=$1 ORDER BY r.created_at DESC LIMIT 200', [id]); }

  @Post('organizations/:id/contracts') async contract(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const m = await this.s.role(id, u.id); if (!['owner', 'manager'].includes(m.role)) throw new ForbiddenException();
    const i = parse(z.object({ propertyId: z.string().uuid(), professionalId: z.string().uuid(), serviceId: z.number().int(), rrule: z.string().regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/), amount: z.number().int().positive(), startsOn: z.string(), endsOn: z.string().optional() }), b);
    return this.db.one(`INSERT INTO maintenance_contracts (organization_id, property_id, professional_id, service_id, rrule, amount, starts_on, ends_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, i.propertyId, i.professionalId, i.serviceId, i.rrule, i.amount, i.startsOn, i.endsOn ?? null]);
  }
  @Get('organizations/:id/spend') async spend(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.s.role(id, u.id);
    return this.db.query(`SELECT date_trunc('month', completed_at)::date AS month, count(*) jobs, sum(total)::bigint spend FROM bookings WHERE organization_id=$1 AND status IN ('completed','settlement_pending','settled') GROUP BY 1 ORDER BY 1 DESC`, [id]);
  }
}
