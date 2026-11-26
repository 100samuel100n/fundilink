import 'reflect-metadata';
import {
  CanActivate, ConflictException, createParamDecorator, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Pool, PoolClient } from 'pg';
import { ZodSchema } from 'zod';

/* ---------------- CORS / allowed origins ---------------- */
/** PUBLIC_WEB_URL may hold several comma-separated origins (apex, www, app subdomain). Outside production, any localhost port is allowed
 *  so Next (3000) and Expo web (8081) just work. */
export function originAllowed(origin?: string | null): boolean {
  if (!origin) return true; // native apps and curl send no Origin header
  const list = (process.env.PUBLIC_WEB_URL ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
  const extra = (process.env.CORS_ORIGINS ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
  if ([...list, ...extra].includes(origin.replace(/\/$/, ''))) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return true;
  if (process.env.ENABLE_DEMO === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Staging convenience: any Railway-generated address (https://xxx.up.railway.app) may call the API while demo mode is on.
  if (process.env.ENABLE_DEMO === 'true' && /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) return true;
  const root = process.env.ROOT_DOMAIN; // e.g. intonelenterprise.com -> allows https://anything.intonelenterprise.com
  if (root && new RegExp(`^https://([a-z0-9-]+\\.)*${root.replace(/\./g, '\\.')}$`).test(origin)) return true;
  return false;
}
export const corsOptions = {
  origin: (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => cb(null, originAllowed(o)),
  credentials: true,
};

/* ---------------- Database ---------------- */
@Injectable()
export class Db {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL, max: 20,
    // Railway's public proxy URL needs TLS; the private network URL (postgres.railway.internal) does not.
    ssl: /proxy\.rlwy\.net|\.railway\.app|sslmode=require/.test(process.env.DATABASE_URL ?? '') ? { rejectUnauthorized: false } : undefined,
  });

  async query<T = any>(text: string, params: any[] = []): Promise<T[]> {
    return (await this.pool.query(text, params)).rows as T[];
  }
  async one<T = any>(text: string, params: any[] = []): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0];
  }
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e: any) {
      await c.query('ROLLBACK');
      // 23P01 = exclusion_violation: the DB-level double-booking guarantee fired
      if (e?.code === '23P01') throw new ConflictException('That time slot was just taken. Please pick another.');
      throw e;
    } finally {
      c.release();
    }
  }
}

/* ---------------- Validation ---------------- */
export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

/* ---------------- Auth, RBAC ---------------- */
export interface AuthUser { id: string; roles: string[]; perms: string[] }

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
export const Public = () => SetMetadata('public', true);
export const Perm = (...perms: string[]) => SetMetadata('perms', perms);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException();
    try {
      const p = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
      req.user = { id: p.sub, roles: p.roles ?? [], perms: p.perms ?? [] } as AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

/** Authorisation is enforced here on the server, not by hiding navigation items. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const need = this.reflector.getAllAndOverride<string[]>('perms', [ctx.getHandler(), ctx.getClass()]);
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    const u: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!need?.length && !roles?.length) return true;
    if (!u) throw new UnauthorizedException();
    if (u.perms.includes('*')) return true;
    if (roles?.length && !roles.some((r) => u.roles.includes(r))) throw new ForbiddenException('Role not permitted');
    if (need?.length && !need.every((p) => u.perms.includes(p))) throw new ForbiddenException('Missing permission');
    return true;
  }
}

/* ---------------- Audit ---------------- */
@Injectable()
export class Audit {
  constructor(private db: Db) {}
  async log(
    u: Pick<AuthUser, 'id' | 'roles'> | null,
    a: { action: string; kind: string; id: string; before?: unknown; after?: unknown; reason?: string; ip?: string; device?: string },
    c?: PoolClient,
  ) {
    const q = `INSERT INTO audit_logs (actor_id, actor_role, action, target_kind, target_id, previous_value, new_value, reason, ip, device)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;
    const p = [u?.id ?? null, u?.roles.join(',') ?? 'system', a.action, a.kind, a.id, JSON.stringify(a.before ?? null), JSON.stringify(a.after ?? null), a.reason ?? null, a.ip ?? null, a.device ?? null];
    if (c) await c.query(q, p); else await this.db.query(q, p);
  }
}

/* ---------------- Ledger writer (idempotent, balanced, append-only) ---------------- */
export async function postLedger(
  c: PoolClient,
  key: string,
  kind: string,
  bookingId: string | null,
  entries: { account: string; debit?: number; credit?: number }[],
) {
  const live = entries.filter((e) => (e.debit ?? 0) !== 0 || (e.credit ?? 0) !== 0);
  const d = live.reduce((s, e) => s + (e.debit ?? 0), 0);
  const cr = live.reduce((s, e) => s + (e.credit ?? 0), 0);
  if (d !== cr) throw new Error(`Unbalanced ledger posting ${key}: ${d} vs ${cr}`);
  const tx = await c.query(
    `INSERT INTO ledger_transactions (idempotency_key, kind, booking_id) VALUES ($1,$2,$3)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [key, kind, bookingId]);
  if (tx.rowCount === 0) return false; // already posted: duplicate webhook / retry
  for (const e of live) {
    await c.query('INSERT INTO ledger_entries (transaction_id, account, debit, credit) VALUES ($1,$2,$3,$4)', [tx.rows[0].id, e.account, e.debit ?? 0, e.credit ?? 0]);
  }
  return true;
}

export const sha256 = async (s: string) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s).digest('hex');
};
