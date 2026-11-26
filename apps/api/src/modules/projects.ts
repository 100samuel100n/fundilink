import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { buildInvoice, DEFAULT_FEES, milestoneAmounts, validateMilestones } from '@fundilink/domain';
import { AuthUser, CurrentUser, Db, parse, postLedger } from '../common/core.ts';

const item = z.object({ label: z.string(), kind: z.enum(['labour', 'materials', 'transport', 'other']), quantity: z.number().positive(), unitAmount: z.number().int().nonnegative() });

@Injectable()
export class ProjectService {
  constructor(private db: Db) {}

  /** Customer posts a project; the system invites the best-matching professionals to quote. */
  async create(u: AuthUser, i: { title: string; scope: string; address: string; lat: number; lng: number; budget?: number; categoryId: number; attachmentKeys?: string[]; organizationId?: string }) {
    return this.db.tx(async (c) => {
      const p = (await c.query(
        `INSERT INTO projects (customer_id, organization_id, title, scope, address, location, budget) VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326)::geography, $8) RETURNING *`,
        [u.id, i.organizationId ?? null, i.title, i.scope, i.address, i.lng, i.lat, i.budget ?? null])).rows[0];
      const pros = (await c.query(`SELECT id, user_id FROM nearby_professionals($1,$2,25,$3,0,false,8) n JOIN professional_profiles pp USING (id)`, [i.lat, i.lng, i.categoryId])).rows;
      for (const pr of pros) {
        await c.query(`INSERT INTO quotations (project_id, professional_id, status) VALUES ($1,$2,'requested') ON CONFLICT DO NOTHING`, [p.id, pr.id]);
        await c.query(`INSERT INTO notifications (user_id, template, title, body, data, channels) VALUES ($1,'quote_request','New quotation request',$2,$3,'{in_app,push,sms}')`, [pr.user_id, i.title, JSON.stringify({ projectId: p.id })]);
      }
      return { project: p, invited: pros.length };
    });
  }

  async submitQuote(u: AuthUser, quotationId: string, i: { scope: string; exclusions?: string; durationDays: number; validDays: number; items: z.infer<typeof item>[]; milestones: { title: string; percentBps: number; criteria: string }[] }) {
    const q = await this.db.one<any>(`SELECT q.*, p.user_id FROM quotations q JOIN professional_profiles p ON p.id=q.professional_id WHERE q.id=$1`, [quotationId]);
    if (!q || q.user_id !== u.id) throw new ForbiddenException();
    if (!['requested', 'revision_requested'].includes(q.status)) throw new BadRequestException('Quotation can no longer be edited');
    try { validateMilestones(i.milestones); } catch (e: any) { throw new BadRequestException(e.message); }
    const inv = buildInvoice(i.items, DEFAULT_FEES);
    await this.db.tx(async (c) => {
      await c.query('DELETE FROM quotation_items WHERE quotation_id=$1', [quotationId]);
      for (const l of i.items) await c.query('INSERT INTO quotation_items (quotation_id,label,kind,quantity,unit_amount) VALUES ($1,$2,$3,$4,$5)', [quotationId, l.label, l.kind, l.quantity, l.unitAmount]);
      await c.query(`UPDATE quotations SET status='submitted', scope=$2, exclusions=$3, duration_days=$4, valid_until=current_date + $5::int, total=$6, milestones=$7, version=version+1, submitted_at=now() WHERE id=$1`,
        [quotationId, i.scope, i.exclusions ?? null, i.durationDays, i.validDays, inv.customerTotal, JSON.stringify(i.milestones)]);
    });
    return { total: inv.customerTotal };
  }

  async compare(u: AuthUser, projectId: string) {
    const pr = await this.db.one<any>('SELECT customer_id FROM projects WHERE id=$1', [projectId]);
    if (!pr || pr.customer_id !== u.id) throw new ForbiddenException();
    return this.db.query(
      `SELECT q.id, q.total, q.duration_days, q.valid_until, q.scope, q.exclusions, pp.display_name, pp.rating_avg, pp.rating_count, pp.completed_jobs,
         (SELECT json_agg(json_build_object('label',label,'kind',kind,'quantity',quantity,'unit',unit_amount)) FROM quotation_items WHERE quotation_id=q.id) items
       FROM quotations q JOIN professional_profiles pp ON pp.id=q.professional_id WHERE q.project_id=$1 AND q.status='submitted' ORDER BY q.total`, [projectId]);
  }

  /** Accepting a quote activates the project and creates agreed milestones with computed amounts. */
  async accept(u: AuthUser, quotationId: string) {
    return this.db.tx(async (c) => {
      const q = (await c.query(`SELECT q.*, pr.customer_id FROM quotations q JOIN projects pr ON pr.id=q.project_id WHERE q.id=$1 FOR UPDATE`, [quotationId])).rows[0];
      if (!q || q.customer_id !== u.id) throw new ForbiddenException();
      if (q.status !== 'submitted') throw new BadRequestException('Quotation is not open');
      if (q.valid_until && new Date(q.valid_until) < new Date(new Date().toDateString())) throw new BadRequestException('Quotation has expired');
      const ms: { title: string; criteria: string; percentBps: number }[] = q.milestones;
      const amounts = milestoneAmounts(Number(q.total), ms);
      await c.query(`DELETE FROM project_milestones WHERE project_id=$1`, [q.project_id]);
      for (const [idx, m] of ms.entries()) {
        await c.query(`INSERT INTO project_milestones (project_id, position, title, criteria, percent_bps, amount, approval_deadline) VALUES ($1,$2,$3,$4,$5,$6, NULL)`, [q.project_id, idx + 1, m.title, m.criteria, m.percentBps, amounts[idx]]);
      }
      await c.query(`UPDATE quotations SET status='accepted', decided_at=now() WHERE id=$1`, [quotationId]);
      await c.query(`UPDATE quotations SET status='rejected', decided_at=now() WHERE project_id=$1 AND id<>$2 AND status IN ('submitted','requested')`, [q.project_id, quotationId]);
      await c.query(`UPDATE projects SET status='active', professional_id=$2 WHERE id=$1`, [q.project_id, q.professional_id]);
      return { projectId: q.project_id, milestones: amounts.length };
    });
  }

  async requestRevision(u: AuthUser, quotationId: string, note: string) {
    const q = await this.db.one<any>(`SELECT q.id, pr.customer_id FROM quotations q JOIN projects pr ON pr.id=q.project_id WHERE q.id=$1`, [quotationId]);
    if (!q || q.customer_id !== u.id) throw new ForbiddenException();
    await this.db.query(`UPDATE quotations SET status='revision_requested' WHERE id=$1 AND status='submitted'`, [quotationId]);
    return { ok: true, note };
  }

  /** Pro submits milestone evidence; customer approves; if they don't respond by the deadline it auto-approves (funds never locked forever). */
  async submitMilestone(u: AuthUser, milestoneId: string, note: string) {
    const m = await this.db.one<any>(`SELECT m.*, p.professional_id, pp.user_id FROM project_milestones m JOIN projects p ON p.id=m.project_id JOIN professional_profiles pp ON pp.id=p.professional_id WHERE m.id=$1`, [milestoneId]);
    if (!m || m.user_id !== u.id) throw new ForbiddenException();
    const hours = Number((await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='milestone.auto_approve_hours'`))?.value ?? 72);
    await this.db.query(`UPDATE project_milestones SET status='submitted', approval_deadline = now() + ($2 || ' hours')::interval WHERE id=$1 AND status IN ('pending','in_progress')`, [milestoneId, hours]);
    await this.db.query(`INSERT INTO project_updates (project_id, milestone_id, author_id, body) VALUES ($1,$2,$3,$4)`, [m.project_id, milestoneId, u.id, note]);
  }

  async approveMilestone(u: AuthUser | null, milestoneId: string, auto = false) {
    await this.db.tx(async (c) => {
      const m = (await c.query(`SELECT m.*, p.customer_id, p.professional_id FROM project_milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=$1 FOR UPDATE`, [milestoneId])).rows[0];
      if (!m || m.status !== 'submitted') throw new BadRequestException('Milestone is not awaiting approval');
      if (!auto && m.customer_id !== u?.id) throw new ForbiddenException();
      await c.query(`UPDATE project_milestones SET status='approved' WHERE id=$1`, [milestoneId]);
      await c.query(`INSERT INTO milestone_approvals (milestone_id, approved_by, auto) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [milestoneId, u?.id ?? null, auto]);
      const acct = (await c.query('SELECT id FROM payout_accounts WHERE professional_id=$1 AND active LIMIT 1', [m.professional_id])).rows[0];
      const s = (await c.query(`INSERT INTO settlements (professional_id, payout_account_id, amount, idempotency_key) VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [m.professional_id, acct?.id ?? null, m.amount, `milestone:${milestoneId}`])).rows[0];
      if (s) await c.query('INSERT INTO settlement_items (settlement_id, milestone_id, amount) VALUES ($1,$2,$3)', [s.id, milestoneId, m.amount]);
    });
  }
}

@Controller('projects')
export class ProjectController {
  constructor(private s: ProjectService, private db: Db) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() b: unknown) {
    return this.s.create(u, parse(z.object({ title: z.string().min(3), scope: z.string().min(10), address: z.string(), lat: z.number(), lng: z.number(), budget: z.number().int().positive().optional(), categoryId: z.number().int(), organizationId: z.string().uuid().optional() }), b));
  }
  @Get() mine(@CurrentUser() u: AuthUser) { return this.db.query('SELECT * FROM projects WHERE customer_id=$1 OR professional_id IN (SELECT id FROM professional_profiles WHERE user_id=$1) ORDER BY created_at DESC', [u.id]); }
  @Get(':id/quotations') compare(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.compare(u, id); }
  @Get(':id') async get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const p = await this.db.one<any>('SELECT * FROM projects WHERE id=$1', [id]);
    if (!p) throw new NotFoundException();
    const mine = p.customer_id === u.id || !!(await this.db.one('SELECT 1 FROM professional_profiles WHERE id=$1 AND user_id=$2', [p.professional_id, u.id]));
    if (!mine) throw new ForbiddenException();
    return { ...p, milestones: await this.db.query('SELECT * FROM project_milestones WHERE project_id=$1 ORDER BY position', [id]), updates: await this.db.query('SELECT * FROM project_updates WHERE project_id=$1 ORDER BY created_at DESC', [id]) };
  }
  @Post('quotations/:id/submit') submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) {
    return this.s.submitQuote(u, id, parse(z.object({ scope: z.string().min(10), exclusions: z.string().optional(), durationDays: z.number().int().positive(), validDays: z.number().int().min(1).max(60).default(14), items: z.array(item).min(1), milestones: z.array(z.object({ title: z.string(), percentBps: z.number().int().positive(), criteria: z.string() })).min(1) }), b));
  }
  @Post('quotations/:id/accept') accept(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.accept(u, id); }
  @Post('quotations/:id/revision') revise(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) { return this.s.requestRevision(u, id, parse(z.object({ note: z.string().min(3) }), b).note); }
  @Post('milestones/:id/submit') submitM(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: unknown) { return this.s.submitMilestone(u, id, parse(z.object({ note: z.string().min(3) }), b).note); }
  @Post('milestones/:id/approve') approveM(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.approveMilestone(u, id); }
}
