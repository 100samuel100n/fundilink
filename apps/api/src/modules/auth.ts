import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Db, Public, parse, sha256 } from '../common/core.ts';
import { Email, Sms } from '../providers/providers.ts';
import { tplBuild } from './templates.ts';

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

@Injectable()
export class AuthService {
  constructor(private db: Db, private jwt: JwtService, private sms: Sms, private email: Email) {}

  /** We generate and store the code (hashed). Telnyx / Resend only deliver it. */
  async requestOtp(destination: string, purpose: string) {
    const recent = await this.db.one<{ n: string }>(
      `SELECT count(*) n FROM otp_codes WHERE destination=$1 AND created_at > now() - interval '1 hour'`, [destination]);
    if (Number(recent?.n) >= MAX_SENDS_PER_HOUR) throw new BadRequestException('Too many codes requested. Try again later.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO otp_codes (destination, purpose, code_hash, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
      [destination, purpose, await sha256(`${destination}:${purpose}:${code}`), OTP_TTL_MIN]);
    const tp = await tplBuild('otp_code', { code, minutes: OTP_TTL_MIN });
    const text = tp?.body ?? `Your FundiLink code is ${code}. It expires in ${OTP_TTL_MIN} minutes. Never share it.`;
    if (destination.includes('@')) await this.email.send(destination, tp?.title ?? 'Your FundiLink code', `<p>${text}</p>`);
    else await this.sms.send(destination, text);
    // Demo/testing without an SMS provider: hand the code back so you can finish sign-up. NEVER on when ENABLE_DEMO is off.
    return process.env.ENABLE_DEMO === 'true' && !process.env.TELNYX_API_KEY ? { devCode: code } : { sent: true };
  }

  async verifyOtp(destination: string, purpose: string, code: string) {
    const row = await this.db.one<any>(
      `SELECT * FROM otp_codes WHERE destination=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`, [destination, purpose]);
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Code expired or invalid');
    await this.db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id=$1', [row.id]);
    if (row.code_hash !== (await sha256(`${destination}:${purpose}:${code}`))) throw new BadRequestException('Incorrect code');
    await this.db.query('UPDATE otp_codes SET consumed_at = now() WHERE id=$1', [row.id]);
  }

  private async issue(userId: string, meta: { device?: string; ip?: string }) {
    const roles = (await this.db.query<{ code: string }>(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id=$1`, [userId])).map((r) => r.code);
    const perms = (await this.db.query<{ code: string }>(
      `SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id=$1`, [userId])).map((r) => r.code);
    const access = await this.jwt.signAsync({ sub: userId, roles, perms }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' });
    const refresh = randomBytes(32).toString('base64url');
    const s = await this.db.one<{ id: string }>(
      `INSERT INTO user_sessions (user_id, refresh_hash, device, ip) VALUES ($1,$2,$3,$4) RETURNING id`,
      [userId, await sha256(refresh), meta.device ?? null, meta.ip ?? null]);
    return { accessToken: access, refreshToken: `${s!.id}.${refresh}`, roles };
  }

  async register(i: { fullName: string; phone: string; email?: string; password?: string; otp: string; role: 'customer' | 'professional' }, meta: any) {
    await this.verifyOtp(i.phone, 'signup', i.otp);
    const hash = i.password ? await argon2.hash(i.password, { type: argon2.argon2id }) : null;
    const u = await this.db.one<{ id: string }>(
      `INSERT INTO users (phone, email, password_hash, full_name, phone_verified_at) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT DO NOTHING RETURNING id`, [i.phone, i.email ?? null, hash, i.fullName]);
    if (!u) throw new BadRequestException('An account with this phone or email already exists');
    await this.db.query(`INSERT INTO user_roles SELECT $1, id FROM roles WHERE code=$2`, [u.id, i.role]);
    if (i.role === 'customer') await this.db.query('INSERT INTO customer_profiles (user_id, referral_code) VALUES ($1,$2)', [u.id, randomBytes(4).toString('hex')]);
    return this.issue(u.id, meta);
  }

  async login(i: { identifier: string; password?: string; otp?: string }, meta: any) {
    const u = await this.db.one<any>(`SELECT * FROM users WHERE (phone=$1 OR email=$1) AND status='active'`, [i.identifier]);
    if (!u) throw new UnauthorizedException('Invalid credentials');
    if (i.otp) await this.verifyOtp(i.identifier, 'login', i.otp);
    else if (!u.password_hash || !i.password || !(await argon2.verify(u.password_hash, i.password))) throw new UnauthorizedException('Invalid credentials');
    return this.issue(u.id, meta);
  }


  /* ---------------- Sign in with Google ----------------
   * Server-side OAuth (authorization-code flow). Works identically for the website, Expo Go, dev builds and store builds:
   *   app -> GET /auth/google/start?redirect=<app url>&role=customer
   *       -> Google -> GET /auth/google/callback  -> 302 back to <app url>?code=<one-time code>
   *   app -> POST /auth/google/exchange {code}   -> normal FundiLink session
   * Tokens never appear in URLs. The one-time code lives 2 minutes and works once.
   */
  googleConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }

  redirectAllowed(url: string): boolean {
    try {
      if (/^(fundilink|exp|exps):\/\//i.test(url)) return true; // native deep link / Expo Go
      const u = new URL(url);
      const origins = [process.env.PUBLIC_WEB_URL, process.env.CORS_ORIGINS].filter(Boolean).join(',').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
      if (origins.includes(u.origin)) return true;
      if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
      if (process.env.ENABLE_DEMO === 'true' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
      const root = process.env.ROOT_DOMAIN;
      if (root && u.protocol === 'https:' && (u.hostname === root || u.hostname.endsWith('.' + root))) return true;
    } catch { /* fallthrough */ }
    return false;
  }

  apiBase(req: any) { return (process.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''); }

  async googleStart(req: any, redirect: string, role: 'customer' | 'professional') {
    if (!this.googleConfigured()) throw new BadRequestException('Google sign-in is not configured on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
    if (!this.redirectAllowed(redirect)) throw new BadRequestException('That return address is not allowed');
    const state = await this.jwt.signAsync({ r: redirect, role, n: randomBytes(8).toString('hex') }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '10m' });
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${this.apiBase(req)}/auth/google/callback`, response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  /** Google's tokeninfo endpoint verifies the ID token's signature, expiry and issuer for us. We then check audience + email_verified. */
  private async verifyGoogleIdToken(idToken: string) {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) throw new UnauthorizedException('Google sign-in could not be verified');
    const t: any = await r.json();
    const allowed = [process.env.GOOGLE_CLIENT_ID, ...(process.env.GOOGLE_CLIENT_IDS ?? '').split(',')].map((x) => x?.trim()).filter(Boolean);
    if (!allowed.includes(t.aud)) throw new UnauthorizedException('Google token was issued for a different app');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) throw new UnauthorizedException('Bad token issuer');
    if (String(t.email_verified) !== 'true') throw new UnauthorizedException('Your Google email is not verified');
    return { sub: String(t.sub), email: String(t.email).toLowerCase(), name: String(t.name ?? t.email.split('@')[0]), picture: t.picture as string | undefined };
  }

  async googleCallback(req: any, code: string, state: string): Promise<string> {
    let st: { r: string; role: 'customer' | 'professional' };
    try { st = await this.jwt.verifyAsync(state, { secret: process.env.JWT_ACCESS_SECRET }); } catch { throw new BadRequestException('Sign-in session expired. Please try again.'); }
    const back = (params: Record<string, string>) => `${st.r}${st.r.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
    try {
      const tr = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${this.apiBase(req)}/auth/google/callback`, grant_type: 'authorization_code' }),
      });
      const tj: any = await tr.json();
      if (!tr.ok || !tj.id_token) throw new Error(tj.error_description ?? 'Google rejected the sign-in');
      const userId = await this.upsertGoogleUser(await this.verifyGoogleIdToken(tj.id_token), st.role);
      const otc = randomBytes(32).toString('base64url');
      await this.db.query(`INSERT INTO oauth_codes (code_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '2 minutes')`, [await sha256(otc), userId]);
      return back({ code: otc });
    } catch (e: any) {
      return back({ error: e?.message ?? 'Google sign-in failed' });
    }
  }

  /** Existing google_sub -> that user. Else verified email matches an account -> link it. Else create a new account. */
  async upsertGoogleUser(g: { sub: string; email: string; name: string; picture?: string }, role: 'customer' | 'professional') {
    let u = await this.db.one<any>('SELECT id, status FROM users WHERE google_sub=$1', [g.sub]);
    if (!u) {
      u = await this.db.one<any>('SELECT id, status FROM users WHERE lower(email)=$1', [g.email]);
      if (u) await this.db.query(`UPDATE users SET google_sub=$2, email_verified_at = COALESCE(email_verified_at, now()), avatar_url = COALESCE(avatar_url,$3) WHERE id=$1`, [u.id, g.sub, g.picture ?? null]);
    }
    if (!u) {
      u = await this.db.one<any>(
        `INSERT INTO users (email, full_name, avatar_url, google_sub, auth_provider, email_verified_at) VALUES ($1,$2,$3,$4,'google', now()) RETURNING id, status`,
        [g.email, g.name, g.picture ?? null, g.sub]);
      await this.db.query(`INSERT INTO user_roles SELECT $1, id FROM roles WHERE code=$2`, [u.id, role]);
      if (role === 'customer') await this.db.query('INSERT INTO customer_profiles (user_id, referral_code) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, randomBytes(4).toString('hex')]);
    }
    if (u.status !== 'active') throw new UnauthorizedException('This account is not active');
    return u.id as string;
  }

  async googleExchange(code: string, meta: any) {
    const row = await this.db.one<any>(
      `UPDATE oauth_codes SET consumed_at = now() WHERE code_hash=$1 AND consumed_at IS NULL AND expires_at > now() RETURNING user_id`, [await sha256(code)]);
    if (!row) throw new BadRequestException('Sign-in link expired. Please try again.');
    return this.issue(row.user_id, meta);
  }

  /** For native Google Sign-In SDKs (dev/store builds): the app sends the Google ID token directly. */
  async googleIdToken(idToken: string, role: 'customer' | 'professional', meta: any) {
    return this.issue(await this.upsertGoogleUser(await this.verifyGoogleIdToken(idToken), role), meta);
  }

  async refresh(token: string, meta: any) {
    const [sid, secret] = token.split('.');
    const s = await this.db.one<any>('SELECT * FROM user_sessions WHERE id=$1 AND revoked_at IS NULL', [sid]);
    if (!s || s.refresh_hash !== (await sha256(secret ?? ''))) throw new UnauthorizedException();
    await this.db.query('UPDATE user_sessions SET revoked_at = now() WHERE id=$1', [sid]); // rotate
    return this.issue(s.user_id, meta);
  }

  async logout(token: string) {
    const [sid] = token.split('.');
    await this.db.query('UPDATE user_sessions SET revoked_at = now() WHERE id=$1', [sid]);
  }
}

const phone = z.string().regex(/^\+?[1-9]\d{8,14}$/, 'Use international format, e.g. +2547...');

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}
  private meta = (req: any) => ({ ip: req.ip, device: req.headers['user-agent'] });


  @Public() @Get('providers')
  providers() { return { google: this.s.googleConfigured(), phoneOtp: true, demo: process.env.ENABLE_DEMO === 'true' }; }

  @Public() @Get('google/start')
  async googleStart(@Query() q: any, @Req() req: any, @Res() res: any) {
    const role = q.role === 'professional' ? 'professional' : 'customer';
    res.redirect(302, await this.s.googleStart(req, String(q.redirect ?? ''), role));
  }
  @Public() @Get('google/callback')
  async googleCallback(@Query() q: any, @Req() req: any, @Res() res: any) {
    if (q.error || !q.code || !q.state) {
      let back = ''; try { back = JSON.parse(Buffer.from(String(q.state).split('.')[1], 'base64url').toString()).r; } catch { /* ignore */ }
      if (back && this.s.redirectAllowed(back)) return res.redirect(302, `${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(String(q.error ?? 'cancelled'))}`);
      return res.status(400).send('Google sign-in was cancelled.');
    }
    res.redirect(302, await this.s.googleCallback(req, String(q.code), String(q.state)));
  }
  @Public() @Post('google/exchange')
  googleExchange(@Body() b: unknown, @Req() req: any) { return this.s.googleExchange(parse(z.object({ code: z.string().min(20) }), b).code, this.meta(req)); }
  @Public() @Post('google/token')
  googleToken(@Body() b: unknown, @Req() req: any) {
    const i = parse(z.object({ idToken: z.string().min(20), role: z.enum(['customer', 'professional']).default('customer') }), b);
    return this.s.googleIdToken(i.idToken, i.role, this.meta(req));
  }

  @Public() @Post('otp') @HttpCode(200)
  otp(@Body() b: unknown) {
    const i = parse(z.object({ destination: z.string().min(5), purpose: z.enum(['signup', 'login']) }), b);
    return this.s.requestOtp(i.destination, i.purpose);
  }
  @Public() @Post('register')
  register(@Body() b: unknown, @Req() req: any) {
    return this.s.register(parse(z.object({ fullName: z.string().min(2), phone, email: z.string().email().optional(), password: z.string().min(8).optional(), otp: z.string().length(6), role: z.enum(['customer', 'professional']) }), b), this.meta(req));
  }
  @Public() @Post('login')
  login(@Body() b: unknown, @Req() req: any) {
    return this.s.login(parse(z.object({ identifier: z.string(), password: z.string().optional(), otp: z.string().length(6).optional() }), b), this.meta(req));
  }
  @Public() @Post('refresh')
  refresh(@Body() b: unknown, @Req() req: any) { return this.s.refresh(parse(z.object({ refreshToken: z.string() }), b).refreshToken, this.meta(req)); }
  @Post('logout') @HttpCode(204)
  async logout(@Body() b: unknown) { await this.s.logout(parse(z.object({ refreshToken: z.string() }), b).refreshToken); }
}