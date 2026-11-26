import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuthUser, CurrentUser, Db, Audit, parse } from '../common/core.ts';

/* ======================================================================================================
   Professional self-service verification: documents, qualifications, business registration.
   Qualification is only "verified" after human review; passing identity checks never implies it.
   ====================================================================================================== */
@Controller('professional')
export class VerificationSelfController {
  constructor(private db: Db) {}
  private async mine(u: AuthUser) { const p = await this.db.one<any>('SELECT * FROM professional_profiles WHERE user_id=$1', [u.id]); if (!p) throw new ForbiddenException('No professional profile'); return p; }

  @Get('verification') async status(@CurrentUser() u: AuthUser) {
    const p = await this.mine(u);
    return {
      profileStatus: p.status,
      levels: await this.db.query(`SELECT level, state, decision_reason, expires_at, qualification_id FROM professional_verifications WHERE professional_id=$1 ORDER BY level`, [p.id]),
      qualifications: await this.db.query(`SELECT id, kind, title, issuer, reference_no, issued_on, expires_on FROM professional_qualifications WHERE professional_id=$1 ORDER BY id`, [p.id]),
      documents: await this.db.query(`SELECT id, kind, uploaded_at FROM professional_documents WHERE professional_id=$1 ORDER BY uploaded_at DESC`, [p.id]),
      licenceGaps: await this.db.query(`SELECT c.name, c.license_body FROM professional_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.professional_id=$1 AND c.requires_license
          AND NOT EXISTS (SELECT 1 FROM professional_verifications v WHERE v.professional_id=pc.professional_id AND v.level='qualification' AND v.state='approved')`, [p.id]),
      note: 'Qualifications are optional for most trades. Licensed categories need the relevant licence before the qualification badge or those listings are enabled.',
    };
  }

  /** National ID / passport number is encrypted at the application layer before storage. */
  @Post('documents') async doc(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ kind: z.enum(['national_id', 'passport', 'business_reg', 'kra_pin', 'cert']), storageKey: z.string().min(5), idNumber: z.string().min(4).max(40).optional() }), b);
    const p = await this.mine(u);
    if (!i.storageKey.includes(`/${p.id}/`) && !i.storageKey.includes(u.id)) throw new BadRequestException('That file was not uploaded by you');
    await this.db.query(`INSERT INTO professional_documents (professional_id, kind, storage_key, id_number_encrypted) VALUES ($1,$2,$3, CASE WHEN $4::text IS NULL THEN NULL ELSE pgp_sym_encrypt($4, $5)::bytea END)`, [p.id, i.kind, i.storageKey, i.idNumber ?? null, process.env.FIELD_ENCRYPTION_KEY ?? 'dev-only-change-me']);
    await this.db.query(`INSERT INTO professional_verifications (professional_id, level, state) VALUES ($1,'identity','pending') ON CONFLICT DO NOTHING`, [p.id]);
    return { ok: true };
  }

  @Post('qualifications') async qualification(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ kind: z.enum(['certificate', 'licence', 'education', 'membership', 'training']), title: z.string().min(2), issuer: z.string().optional(), referenceNo: z.string().optional(), issuedOn: z.string().date().optional(), expiresOn: z.string().date().optional(), documentKey: z.string().optional() }), b);
    const p = await this.mine(u);
    return this.db.tx(async (c) => {
      const q = (await c.query(`INSERT INTO professional_qualifications (professional_id, kind, title, issuer, reference_no, issued_on, expires_on, document_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [p.id, i.kind, i.title, i.issuer ?? null, i.referenceNo ?? null, i.issuedOn ?? null, i.expiresOn ?? null, i.documentKey ?? null])).rows[0];
      if (['licence', 'certificate', 'training'].includes(i.kind)) await c.query(`INSERT INTO professional_verifications (professional_id, level, state, qualification_id) VALUES ($1,'qualification','pending',$2) ON CONFLICT DO NOTHING`, [p.id, q.id]);
      return q;
    });
  }

  @Post('business-verification') async business(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    const i = parse(z.object({ registrationNo: z.string().min(3), kraPin: z.string().optional(), documentKey: z.string().min(5) }), b);
    const p = await this.mine(u);
    if (p.account_type !== 'business') throw new BadRequestException('Business verification is for business accounts');
    await this.db.tx(async (c) => {
      await c.query(`INSERT INTO professional_documents (professional_id, kind, storage_key, id_number_encrypted) VALUES ($1,'business_reg',$2, pgp_sym_encrypt($3,$4)::bytea)`, [p.id, i.documentKey, i.registrationNo, process.env.FIELD_ENCRYPTION_KEY ?? 'dev-only-change-me']);
      if (!(await c.query(`SELECT 1 FROM professional_verifications WHERE professional_id=$1 AND level='business'`, [p.id])).rowCount) await c.query(`INSERT INTO professional_verifications (professional_id, level, state) VALUES ($1,'business','pending')`, [p.id]);
    });
    return { ok: true };
  }

  /** Marketing: shareable public URL + referral code. */
  @Get('marketing') async marketing(@CurrentUser() u: AuthUser) {
    const p = await this.mine(u);
    let cp = await this.db.one<any>('SELECT referral_code FROM customer_profiles WHERE user_id=$1', [u.id]);
    if (!cp) cp = await this.db.one<any>(`INSERT INTO customer_profiles (user_id, referral_code) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET referral_code=COALESCE(customer_profiles.referral_code, EXCLUDED.referral_code) RETURNING referral_code`, [u.id, randomBytes(4).toString('hex').toUpperCase()]);
    const [v] = await this.db.query(`SELECT count(*)::int searches FROM search_events WHERE created_at > now()-interval '30 days'`);
    return { slug: p.slug, shareUrl: `${process.env.PUBLIC_WEB_URL?.split(',')[0] ?? 'https://fundilink.app'}/professionals/${p.slug}`, referralCode: cp?.referral_code, platformSearches30d: v.searches };
  }

  /** Invoices & receipts for either side of a booking. */
  @Get('invoices') async invoices(@CurrentUser() u: AuthUser) {
    const p = await this.mine(u);
    return this.db.query(`SELECT i.id, i.number, i.issued_at, i.payload, b.reference, b.total, b.professional_net FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE b.professional_id=$1 ORDER BY i.issued_at DESC LIMIT 200`, [p.id]);
  }
}

@Controller()
export class InvoiceController {
  constructor(private db: Db) {}
  @Get('invoices') mine(@CurrentUser() u: AuthUser) { return this.db.query(`SELECT i.id, i.number, i.issued_at, b.reference, b.total FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE b.customer_id=$1 ORDER BY i.issued_at DESC LIMIT 200`, [u.id]); }
}

/* ======================================================================================================
   Enterprise extras: team invites & permissions, statements, maintenance history per property.
   ====================================================================================================== */
@Controller('enterprise')
export class EnterpriseExtrasController {
  constructor(private db: Db, private audit: Audit) {}
  private async need(orgId: string, u: AuthUser, roles: string[]) { const m = await this.db.one<any>('SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2', [orgId, u.id]); if (!m || !roles.includes(m.role)) throw new ForbiddenException(); return m.role as string; }

  @Get('organizations/:id/members') async members(@CurrentUser() u: AuthUser, @Param('id') id: string) { await this.need(id, u, ['owner', 'manager', 'approver', 'requester', 'viewer']); return this.db.query(`SELECT m.user_id, m.role, m.spend_limit, us.full_name, us.phone FROM organization_members m JOIN users us ON us.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.role`, [id]); }
  @Post('organizations/:id/members') async invite(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    const i = parse(z.object({ phone: z.string().min(7), role: z.enum(['manager', 'approver', 'requester', 'viewer']), spendLimit: z.number().int().nonnegative().optional() }), b);
    await this.need(id, u, ['owner', 'manager']);
    const t = await this.db.one<any>('SELECT id FROM users WHERE phone=$1', [i.phone]); if (!t) throw new NotFoundException('That person needs a FundiLink account first');
    await this.db.tx(async (c) => {
      await c.query(`INSERT INTO organization_members (organization_id, user_id, role, spend_limit) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,user_id) DO UPDATE SET role=EXCLUDED.role, spend_limit=EXCLUDED.spend_limit`, [id, t.id, i.role, i.spendLimit ?? null]);
      await c.query(`INSERT INTO user_roles SELECT $1, id FROM roles WHERE code='org_member' ON CONFLICT DO NOTHING`, [t.id]);
      await this.audit.log(u, { action: 'org.member.add', kind: 'organization', id, after: { user: t.id, role: i.role } }, c);
    });
    return { ok: true };
  }
  @Post('organizations/:id/members/:userId/remove') async removeMember(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    await this.need(id, u, ['owner']); if (userId === u.id) throw new BadRequestException('Owners cannot remove themselves');
    await this.db.query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2', [id, userId]); await this.audit.log(u, { action: 'org.member.remove', kind: 'organization', id, after: { user: userId } }); return { ok: true };
  }
  @Get('organizations/:id/statement') async statement(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    await this.need(id, u, ['owner', 'manager', 'approver', 'viewer']);
    return this.db.query(`SELECT b.reference, b.created_at, b.status, b.total, b.tax, p.display_name professional, pr.name property, i.number invoice_no
      FROM bookings b JOIN professional_profiles p ON p.id=b.professional_id LEFT JOIN maintenance_requests mr ON mr.id=b.maintenance_request_id LEFT JOIN properties pr ON pr.id=mr.property_id LEFT JOIN invoices i ON i.booking_id=b.id
      WHERE b.organization_id=$1 AND b.status NOT IN ('draft','pending_payment') AND ($2::date IS NULL OR b.created_at>=$2) AND ($3::date IS NULL OR b.created_at<$3::date+1) ORDER BY b.created_at DESC LIMIT 1000`, [id, from ?? null, to ?? null]);
  }
  @Get('organizations/:id/history') async history(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('propertyId') propertyId?: string) {
    await this.need(id, u, ['owner', 'manager', 'approver', 'requester', 'viewer']);
    return this.db.query(`SELECT mr.id, mr.title, mr.status, mr.priority, mr.created_at, pr.name property, b.reference, b.completed_at, p.display_name professional
      FROM maintenance_requests mr JOIN properties pr ON pr.id=mr.property_id LEFT JOIN bookings b ON b.maintenance_request_id=mr.id LEFT JOIN professional_profiles p ON p.id=b.professional_id
      WHERE mr.organization_id=$1 AND ($2::uuid IS NULL OR mr.property_id=$2) ORDER BY mr.created_at DESC LIMIT 500`, [id, propertyId ?? null]);
  }
}
