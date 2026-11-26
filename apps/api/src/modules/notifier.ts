import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../common/core.ts';
import { Push } from '../providers/providers.ts';

export interface Note { template: string; title: string; body: string; data?: Record<string, unknown>; channels?: string[] }

/**
 * Writes the in-app notification AND, for push-only notes, delivers right away instead of waiting for the 30 s housekeeping sweep.
 * Time-critical moments (extra work awaiting approval, payment received, job request) must feel instant.
 * Notes that also use SMS/email/WhatsApp are left to NotifyService.deliverPending, which owns those channels and their preferences.
 */
@Injectable()
export class Notifier {
  private log = new Logger('Notifier');
  constructor(private db: Db, private push: Push) {}

  /** The people behind a professional profile: the owner plus business admins/members. */
  async proUsers(professionalId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT user_id AS id FROM professional_profiles WHERE id=$1 UNION SELECT user_id FROM business_members WHERE business_id=$1`, [professionalId]);
    return rows.map((r) => r.id);
  }

  async send(userIds: string | string[], n: Note): Promise<void> {
    const channels = n.channels ?? ['in_app', 'push'];
    for (const userId of Array.isArray(userIds) ? userIds : [userIds]) {
      try {
        const row = await this.db.one<{ id: string }>(
          `INSERT INTO notifications (user_id, template, title, body, data, channels) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [userId, n.template, n.title, n.body, JSON.stringify(n.data ?? {}), channels]);
        if (!row || !channels.every((c) => c === 'in_app' || c === 'push') || !channels.includes('push')) continue;
        const off = await this.db.one(`SELECT 1 FROM notification_preferences WHERE user_id=$1 AND template=$2 AND channel='push' AND NOT enabled`, [userId, n.template]);
        const tokens = (await this.db.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id=$1', [userId])).map((r) => r.token);
        if (!off && tokens.length) {
          const dead = await this.push.send(tokens, n.title, n.body, { template: n.template, ...(n.data ?? {}) });
          if (dead.length) await this.db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [dead]);
        }
        await this.db.query('UPDATE notifications SET delivered_at=now() WHERE id=$1', [row.id]);
      } catch (e) { this.log.warn(`notify ${n.template} -> ${userId} failed: ${e}`); }
    }
  }
}
