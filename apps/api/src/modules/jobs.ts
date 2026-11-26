import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Db } from '../common/core.ts';
import { BookingService } from './bookings.ts';
import { PaymentService } from './payments.ts';
import { ProjectService } from './projects.ts';
import { NotifyService } from './extensions.ts';

/**
 * Background automation via BullMQ (Redis). Each job is idempotent so retries and overlaps are safe.
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private log = new Logger('Jobs');
  constructor(private db: Db, private bookings: BookingService, private pay: PaymentService, private projects: ProjectService, private notify: NotifyService) {}

  async onModuleInit() {
    if (!process.env.REDIS_URL) { this.log.warn('REDIS_URL not set: background jobs disabled'); return; }
    const connection = { url: process.env.REDIS_URL } as any;
    const q = new Queue('housekeeping', { connection });
    for (const [name, every] of [['expire-requests', 60_000], ['auto-confirm-completion', 300_000], ['auto-approve-milestones', 300_000], ['process-settlements', 120_000], ['deliver-notifications', 30_000], ['verification-expiry', 86_400_000], ['award-loyalty', 600_000], ['purge-tracking', 3_600_000], ['generate-recurring-orders', 3_600_000], ['dispute-escalation', 600_000], ['reconcile-payments', 30_000], ['expire-addons', 60_000]] as const) {
      await q.add(name, {}, { repeat: { every }, removeOnComplete: true, removeOnFail: 100 });
    }
    new Worker('housekeeping', async (job) => this.run(job.name), { connection });
  }

  async run(name: string) {
    switch (name) {
      case 'expire-requests': return this.expireRequests();
      case 'auto-confirm-completion': return this.autoConfirm();
      case 'auto-approve-milestones': return this.autoApproveMilestones();
      case 'process-settlements': return this.settle();
      case 'purge-tracking': return this.db.query(`DELETE FROM booking_tracking_points WHERE booking_id IN (SELECT id FROM bookings WHERE status NOT IN ('en_route','arrived') AND updated_at < now() - interval '24 hours')`);
      case 'deliver-notifications': return this.notify.deliverPending();
      case 'verification-expiry': return this.notify.verificationExpiry();
      case 'award-loyalty': return this.notify.awardLoyalty();
      case 'generate-recurring-orders': return this.recurring();
      case 'reconcile-payments': return this.pay.reconcilePending();
      case 'expire-addons': return this.bookings.expireRevisions();
      case 'dispute-escalation': return this.db.query(`UPDATE disputes SET status='escalated' WHERE status IN ('open','under_review','awaiting_evidence') AND resolution_due_at < now()`);
    }
  }

  /** Unanswered requests expire and the customer is notified (refund follows via the state machine). */
  private async expireRequests() {
    const due = await this.db.query<any>(`SELECT id, customer_id FROM bookings WHERE status='awaiting_acceptance' AND request_expires_at < now() LIMIT 100`);
    for (const b of due) {
      const ok = await this.db.tx((c) => this.bookings.move(c, b.id, 'cancelled', 'system', null, { reason: 'Professional did not respond in time' })).then(() => true).catch((e) => { this.log.warn(String(e)); return false; });
      if (ok) this.pay.autoRefund(b.id, 'Professional did not respond in time').catch((e) => this.log.error(`expiry refund ${b.id}: ${e}`));
      await this.db.query(`INSERT INTO notifications (user_id, template, title, body, data) VALUES ($1,'request_expired','Request expired','The professional did not respond in time. Your payment will be refunded; try another professional.',$2)`, [b.customer_id, JSON.stringify({ bookingId: b.id })]);
    }
  }

  private async autoConfirm() {
    const hours = Number((await this.db.one<any>(`SELECT value FROM platform_settings WHERE key='booking.completion_auto_confirm_hours'`))?.value ?? 48);
    const rows = await this.db.query<any>(`SELECT b.id FROM bookings b WHERE b.status='awaiting_completion' AND b.updated_at < now() - ($1 || ' hours')::interval AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.booking_id=b.id) AND (b.payment_mode='escrow' OR EXISTS (SELECT 1 FROM direct_payments dp WHERE dp.booking_id=b.id)) LIMIT 100`, [hours]);
    for (const b of rows) {
      await this.db.tx((c) => this.bookings.move(c, b.id, 'completed', 'system', null, {}));
      await this.pay.onBookingCompleted(b.id);
    }
  }

  private async autoApproveMilestones() {
    const rows = await this.db.query<any>(`SELECT id FROM project_milestones WHERE status='submitted' AND approval_deadline < now() LIMIT 100`);
    for (const m of rows) await this.projects.approveMilestone(null, m.id, true).catch((e) => this.log.warn(String(e)));
  }

  private async settle() {
    const rows = await this.db.query<any>(`SELECT id FROM settlements WHERE status IN ('pending') AND payout_account_id IS NOT NULL OR (status='failed' AND attempts < 5 AND submitted_at < now() - interval '10 minutes' AND payout_account_id IS NOT NULL) LIMIT 50`);
    for (const s of rows) await this.pay.processSettlement(s.id).catch((e) => this.log.error(`settlement ${s.id}: ${e}`));
  }

  /** Materialise next occurrences of simple RRULEs (WEEKLY/MONTHLY/DAILY) as pending maintenance requests for the pro. */
  private async recurring() {
    const cs = await this.db.query<any>(`SELECT * FROM maintenance_contracts WHERE active AND starts_on <= current_date AND (ends_on IS NULL OR ends_on >= current_date)`);
    for (const c of cs) {
      const freq = /FREQ=(\w+)/.exec(c.rrule)?.[1];
      const interval = freq === 'DAILY' ? '1 day' : freq === 'WEEKLY' ? '7 days' : freq === 'MONTHLY' ? '1 month' : '1 year';
      await this.db.query(
        `INSERT INTO maintenance_requests (organization_id, property_id, category_id, title, description, priority, estimated_cost, status)
         SELECT $1,$2,(SELECT category_id FROM services WHERE id=$3), 'Scheduled: '||(SELECT name FROM services WHERE id=$3), 'Recurring contract '||$4, 'normal', $5, 'approved'
         WHERE NOT EXISTS (SELECT 1 FROM maintenance_requests WHERE property_id=$2 AND title = 'Scheduled: '||(SELECT name FROM services WHERE id=$3) AND created_at > now() - $6::interval)`,
        [c.organization_id, c.property_id, c.service_id, c.id, c.amount, interval]);
    }
  }
}
