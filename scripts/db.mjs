// Cross-platform DB helper (works on Windows without psql installed).
//   node scripts/db.mjs migrate   -> runs db/*.sql in order, skipping files already applied
//   node scripts/db.mjs seed      -> same as migrate (the SQL files are idempotent seed + schema)
//   node scripts/db.mjs reset     -> DROPS the public schema, then migrates (LOCAL ONLY)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of [join(root, '.env'), join(process.cwd(), '.env')]) if (existsSync(f)) { try { process.loadEnvFile(f); } catch {} }
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set (put it in .env at the repo root, or export it).'); process.exit(1); }
const cmd = process.argv[2] ?? 'migrate';
const ssl = /proxy\.rlwy\.net|sslmode=require/.test(url) && !/localhost|127\.0\.0\.1|railway\.internal/.test(url) ? { rejectUnauthorized: false } : undefined;
const c = new pg.Client({ connectionString: url, ssl });
await c.connect();
try {
  if (cmd === 'reset') {
    if (process.env.NODE_ENV === 'production' || process.env.CONFIRM_RESET !== 'yes' && !/localhost|127\.0\.0\.1/.test(url)) {
      console.error('Refusing to reset a non-local database. Set CONFIRM_RESET=yes if you really mean it.'); process.exit(1);
    }
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema dropped.');
  }
  await c.query('CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;').catch((e) => {
    console.error('Could not enable PostGIS/btree_gist. Your Postgres must include PostGIS (use the Railway PostGIS template or docker compose).', e.message); process.exit(1);
  });
  await c.query('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await c.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
  for (const f of readdirSync(join(root, 'db')).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) { console.log('skip   ', f); continue; }
    process.stdout.write(`apply  ${f} ... `);
    await c.query(readFileSync(join(root, 'db', f), 'utf8'));
    await c.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
    console.log('ok');
  }
} finally { await c.end(); }
