// Loads .env for local development. On Railway the variables already exist, so a missing file is fine.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
for (const f of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env'), join(__dirname, '../../../.env'), join(__dirname, '../../../../.env')]) {
  if (existsSync(f)) { try { (process as any).loadEnvFile(f); } catch { /* ignore */ } }
}
