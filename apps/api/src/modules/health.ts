import { Controller, Get } from '@nestjs/common';
import { Db, Public } from '../common/core.ts';

@Controller()
export class HealthController {
  constructor(private db: Db) {}
  @Public() @Get('health') async health() {
    await this.db.query('SELECT 1');
    return { ok: true, at: new Date().toISOString(), demo: process.env.ENABLE_DEMO === 'true', google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), payments: process.env.PAYMENT_PROVIDER ?? 'mock' };
  }
}
