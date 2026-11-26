import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { walletAccount, walletGate, type WalletGate } from '@fundilink/domain';
import { Db } from '../common/core.ts';

export interface WalletSettings { minTopup: number; maxTopup: number; minBalance: number; lowAlert: number }

/**
 * The prepaid professional wallet (Model 2). There is NO balance column to drift: the balance is always derived from the
 * append-only ledger account PRO_WALLET:<professional id>, exactly like every other money figure in the platform.
 */
@Injectable()
export class WalletService {
  constructor(private db: Db) {}

  async setting(key: string, fallback: number): Promise<number> {
    const r = await this.db.one<{ value: unknown }>('SELECT value FROM platform_settings WHERE key=$1', [key]);
    const n = Number(r?.value);
    return Number.isFinite(n) ? n : fallback;
  }

  async settings(): Promise<WalletSettings> {
    const [minTopup, maxTopup, minBalance, lowAlert] = await Promise.all([
      this.setting('wallet.min_topup_minor', 10_000), this.setting('wallet.max_topup_minor', 25_000_000),
      this.setting('wallet.min_balance_minor', 0), this.setting('wallet.low_balance_alert_minor', 50_000),
    ]);
    return { minTopup, maxTopup, minBalance, lowAlert };
  }

    /** Commission already owed on pay-on-site jobs that are accepted but not yet charged. */
  async openExposure(professionalId: string, c?: PoolClient): Promise<number> {
    const q = `SELECT COALESCE(SUM(commission + customer_fee), 0)::bigint AS e FROM bookings
                WHERE professional_id=$1 AND payment_mode='direct' AND commission_charged_at IS NULL
                  AND status IN ('confirmed','scheduled','en_route','arrived','in_progress','awaiting_completion','completed','disputed')`;
    const row = c ? (await c.query(q, [professionalId])).rows[0] : await this.db.one<any>(q, [professionalId]);
    return Number(row.e);
  }

  async balance(professionalId: string, c?: PoolClient): Promise<number> {
    const q = `SELECT COALESCE(SUM(credit) - SUM(debit), 0)::bigint AS b FROM ledger_entries WHERE account=$1`;
    const row = c ? (await c.query(q, [walletAccount(professionalId)])).rows[0] : await this.db.one<any>(q, [walletAccount(professionalId)]);
    return Number(row.b);
  }

   async gate(professionalId: string, commission: number, c?: PoolClient): Promise<WalletGate> {
    const [bal, s, owed] = await Promise.all([this.balance(professionalId, c), this.settings(), this.openExposure(professionalId, c)]);
    return walletGate(bal - owed, commission, s.minBalance); // money already promised to the platform is not spendable twice
  }

  async statement(professionalId: string, limit = 50) {
    return this.db.query(
      `SELECT t.id, t.kind, t.booking_id, t.created_at, (e.credit - e.debit)::bigint AS amount, b.reference
         FROM ledger_entries e JOIN ledger_transactions t ON t.id=e.transaction_id LEFT JOIN bookings b ON b.id=t.booking_id
        WHERE e.account=$1 ORDER BY t.id DESC LIMIT $2`, [walletAccount(professionalId), limit]);
  }

    async summary(professionalId: string) {
    const [balance, s, committed] = await Promise.all([this.balance(professionalId), this.settings(), this.openExposure(professionalId)]);
    const available = balance - committed;
    return {
      balance, committed, available, minBalance: s.minBalance, lowAlert: s.lowAlert, minTopup: s.minTopup, maxTopup: s.maxTopup,
      low: available <= s.lowAlert, canTakeDirect: available > s.minBalance,
    };
  }
}
