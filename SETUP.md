# FundiLink: setup, deploy and testing guide

Domain used below: **intonelenterprise.com**
Recommended layout: `intonelenterprise.com` = website, `api.intonelenterprise.com` = API.

---
## 1. Run everything on your computer (15 minutes)

Needs Node 22+. Easiest without Docker: skip local databases and use RAILWAY.md. Local-only option: Docker Desktop for Postgres+PostGIS and Redis.

```bash
cp .env.example .env                      # Windows: copy .env.example .env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d                      # Postgres+PostGIS and Redis
npm install                               # also builds the shared domain package
npm run db:migrate                        # creates tables, 47 counties + about 185 towns and estates
npm run dev:api                           # terminal 1 -> http://localhost:4000/health
npm run seed:demo                         # terminal 2 -> demo accounts + bookings (API must be running)
npm run dev:web                           # terminal 2 or 3 -> http://localhost:3000
```
Open http://localhost:3000/login. Because `ENABLE_DEMO=true`, a **Demo accounts** box appears: tap one, press Sign in.

Generate secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (run it 3 times: access, refresh, field-encryption).

---
## 2. Test accounts (password for all: `Demo@12345`)

| Role | Login | What to test |
|---|---|---|
| Super admin | admin@demo.fundilink.test | /admin: everything |
| Customer (Nairobi) | amina@demo.fundilink.test | 4 bookings: 2 ready for en-route, 1 awaiting acceptance, 1 awaiting payment |
| Customer (Kisumu) | brian@demo.fundilink.test | 1 booking ready for en-route |
| Plumber | juma@demo.fundilink.test | Amina's plumbing job |
| Electrician | wanjiku@demo.fundilink.test | 1 ready job + 1 request to accept |
| Painter (Kisumu) | achieng@demo.fundilink.test | Brian's job |
| Business owner (Mombasa) | sparkle@demo.fundilink.test | Team, business tools |
| Technician | tech@demo.fundilink.test | Staff inside Sparkle Clean |
| Enterprise manager | manager@demo.fundilink.test | /enterprise |

Also seeded: one verified professional in **every one of the 47 counties**, so each county page and map has results. Promo code `WELCOME10`.

### Testing the en-route (Uber/Bolt-style) flow, step by step
You need two screens: one as the customer, one as the professional (two browsers, a browser + phone, or two phones).
1. **Customer** `amina@…` > My bookings > the *Leak repair* job (status Scheduled). Open it.
2. **Professional** `juma@…` > Bookings > same job > **Start journey**. (Demo mode uses a simulated start point ~5 km away, so no real GPS is needed.)
3. Pro screen shows **Demo drive simulator**. Customer taps **Track live**. Press **Start driving**: the pin moves along the road, the highlighted route and ETA update, the trail turns grey behind the pro.
4. At 100%, on the pro side tap **I've arrived**. The customer receives a **4-digit PIN** (notification and tracking screen).
5. Pro enters the PIN > **Start job** (live sharing stops, as designed) > add completion evidence > **Mark finished**. Customer confirms > review. Money settles through the ledger.
6. Want to replay? Booking page > **Reset this job** (demo only).

Payments: with `PAYMENT_PROVIDER=mock` + demo mode, tapping Pay approves itself after ~2 seconds through the same signed-webhook path a real provider uses (ledger, receipt and state machine all run).

---
## 3. Deploy to Railway

**Follow RAILWAY.md** (dashboard steps, no Docker). Local development below section is the only place Docker appears, and it is optional: you can point `DATABASE_URL` at the Railway PostGIS database instead.

(Old CLI notes follow.)

Install and log in:
```bash
npm i -g @railway/cli
railway login
```
Create the project from the repo root (the folder containing `package.json`):
```bash
railway init            # name it: fundilink
```
**Databases.** Plain Railway Postgres does NOT include PostGIS, and this app needs it. In the Railway dashboard click **+ New > Template** and search **PostGIS** (or deploy image `postgis/postgis:16-3.4` with variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and a volume on `/var/lib/postgresql/data`). Add Redis with **+ New > Database > Redis** (or `railway add --database redis`).

**API service**
```bash
railway add --service api            # empty service
railway link                         # choose project, environment, service: api
```
In the dashboard: api service > Settings > **Config file path** = `/railway.api.json`. Then set variables (dashboard > Variables > Raw editor is easiest; paste the block from section 4, using Railway references for the databases: `DATABASE_URL=${{PostGIS.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`). Deploy:
```bash
railway up --service api
railway domain --service api         # gives you a *.up.railway.app URL, handy for a first test
```
The API runs pending migrations on every boot (`db/*.sql`, tracked in `_migrations`), so no manual SQL.

**Web service**
```bash
railway add --service web
```
Dashboard: web service > Settings > Config file path = `/railway.web.json`; Variables:
`NEXT_PUBLIC_API_URL=https://api.intonelenterprise.com`, `NEXT_PUBLIC_SITE_URL=https://intonelenterprise.com`. Then `railway up --service web`. (NEXT_PUBLIC_* are baked in at build: redeploy after changing them.)

**Seed the demo data** (staging only): set on the api service `ENABLE_DEMO=true` and `SEED_DEMO_ON_BOOT=true`, redeploy once, then remove `SEED_DEMO_ON_BOOT`. It is idempotent.

**Custom domain** (service > Settings > Networking > Custom Domain):
| Service | Domain | DNS record at your registrar |
|---|---|---|
| web | `intonelenterprise.com` and `www.intonelenterprise.com` | Railway shows the exact CNAME/ALIAS target per domain. Apex needs ALIAS/ANAME or Cloudflare CNAME flattening. |
| api | `api.intonelenterprise.com` | CNAME `api` > value Railway shows |
Add the TXT verification record Railway gives you if asked. HTTPS certificates are automatic.
Useful: `railway logs --service api`, `railway variables --service api`, `railway status`.

---
## 4. Environment variables, explained

### API (Railway > api > Variables, or `.env` locally)
| Variable | What it is / how to get it |
|---|---|
| `NODE_ENV` | `production` on Railway, `development` locally. |
| `PORT` | Railway sets it. Locally 4000. |
| `DATABASE_URL` | Postgres connection string. Railway: `${{PostGIS.DATABASE_URL}}`. Local docker default is in `.env.example`. |
| `REDIS_URL` | Redis for background jobs (expiry, settlements, notifications). Railway: `${{Redis.REDIS_URL}}`. Optional but recommended. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two different long random strings (command in section 1). The API refuses to start in production with `change-me`. |
| `FIELD_ENCRYPTION_KEY` | Another random string. Encrypts ID numbers. Never change after launch. |
| `PUBLIC_WEB_URL` | Website origin(s) allowed to call the API: `https://intonelenterprise.com,https://www.intonelenterprise.com`. |
| `API_PUBLIC_URL` | The API's own public URL: `https://api.intonelenterprise.com`. Used to build the Google callback. |
| `ROOT_DOMAIN` | `intonelenterprise.com`. Allows any `*.intonelenterprise.com` origin. |
| `ENABLE_DEMO` | `true` on staging: demo logins, OTP shown on screen, drive simulator, auto-approved mock payments. **`false` (or delete) before real customers.** |
| `SEED_DEMO_ON_BOOT` | `true` once to seed demo data on Railway, then remove. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From Google Cloud (section 5). |
| `MAPBOX_TOKEN`, `MAPS_PROVIDER=mapbox` | mapbox.com > Account > Access tokens > create a token. Gives real road routes for the tracking map. Optional: without it the route is an estimated curve. |
| `S3_*` | Backblaze B2: create a bucket (private), then App Keys > create key. `S3_ENDPOINT`/`S3_REGION` are shown on the bucket page (region looks like `us-west-004`). Needed for photo/document upload. |
| `TELNYX_API_KEY`, `TELNYX_FROM` | Telnyx portal > API Keys; `TELNYX_FROM` is your sender number/ID. Without them, codes are printed in the API log (and shown on screen in demo mode). Kenyan sender-ID registration can take days: start early. |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com > API Keys; verify `intonelenterprise.com` as a sending domain (add the DNS records Resend lists), then `EMAIL_FROM=FundiLink <no-reply@intonelenterprise.com>`. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase console > Project settings > Service accounts > Generate key; paste the whole JSON on one line. For push on built apps. |
| `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` | `mock` for testing. For real money, use a CBK-licensed provider and write its adapter (`providers.ts`); the webhook secret is the provider's signing secret. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | console.anthropic.com or platform.openai.com > API keys. |
| `SENTRY_DSN`, `POSTHOG_KEY` | Optional monitoring/analytics keys. |

### Web (`apps/web/.env.local` or Railway > web > Variables)
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` (see section 3).

### Mobile (`apps/mobile/.env`)
`EXPO_PUBLIC_API_URL`: see the mobile README. Leave unset with Expo Go on the same Wi-Fi: the app finds your computer by itself.

---
## 5. Sign in with Google

1. https://console.cloud.google.com > create/select a project > **APIs & Services > OAuth consent screen**: choose External, app name FundiLink, support email, add your domain `intonelenterprise.com`, scopes `openid`, `email`, `profile`. Add yourself as a test user while in Testing mode; click **Publish app** when ready.
2. **Credentials > Create credentials > OAuth client ID > Web application**.
   - Authorized redirect URIs (exact):
     - `https://api.intonelenterprise.com/auth/google/callback`
     - `http://localhost:4000/auth/google/callback` (local testing)
   - (JavaScript origins can stay empty: the flow runs on the server.)
3. Copy **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the API. Redeploy.
4. "Continue with Google" appears automatically on the web and in the app once the server reports it (`GET /auth/providers`).

Notes: Google rejects private IPs like `192.168.x.x` as redirect URIs, so test Google sign-in against `localhost` (web) or the deployed API (phones). New Google users get a customer account (or professional if they chose that on Register). An existing account with the same verified email is linked, never duplicated.

---
## 6. Before real customers
1. `ENABLE_DEMO=false`, run `npm run seed:demo:purge -w @fundilink/api` (suspends demo users and hides demo professionals).
2. Real payment provider adapter, sandbox-tested, ledger reconciled.
3. Real secrets everywhere; Telnyx + Resend live; Backblaze bucket private.
4. Legal review: Kenya Data Protection Act (ODPC registration), KRA/eTIMS, licensing rules per category.

## 6b. Going live with M-Pesa (and the two payment models)

**What is built.** Two ways to pay, chosen per booking by the customer (and per professional by their own opt-in):

| | Model 1: In-app escrow | Model 2: Pay on site + prepaid wallet |
|---|---|---|
| Customer pays | the platform, by M-Pesa STK Push, when booking | the professional, in cash or M-Pesa, after the job |
| Platform money | held, commission deducted, rest paid to the pro's M-Pesa (B2C) after the customer confirms | commission is deducted from the pro's prepaid wallet when the customer confirms |
| Extra work / materials | pro logs an add-on, customer gets a push, approves and pays it in-app (same escrow) | pro logs an add-on, customer approves in-app, total on site goes up, commission follows |
| Refunds | automatic on decline / expiry / early cancel; manual (maker-checker) otherwise; via M-Pesa Reversal | nothing to refund online |
| Protection | funds held until confirmed | pro needs wallet balance to be offered; customer still gets PIN, tracking, receipt |

**Switching from the mock to real M-Pesa**
1. `node scripts/db.mjs migrate` (applies `db/005_payment_models.sql`).
2. Create an app on the Safaricom Daraja portal. Fill the `MPESA_*` block in `.env`, set `PAYMENT_PROVIDER=mpesa`. Start with `MPESA_ENV=sandbox`.
3. Callbacks: set `MPESA_CALLBACK_BASE` to your public https API URL and `MPESA_CALLBACK_SECRET` to a long random value. On a laptop use a tunnel (ngrok / cloudflared), or leave it empty: pending payments are checked by polling every few seconds anyway.
4. Production: switch to `MPESA_ENV=production` with your live shortcode, passkey, initiator and the **production** certificate. The API refuses to boot in production with an incomplete M-Pesa config or with the mock provider.
5. Turn `ENABLE_DEMO` off.
6. Card and bank payments are not offered: they need a separate licensed card processor adapter (the provider interface in `apps/api/src/providers/providers.ts` is built for it). The apps only show methods the server reports as available.

**How a payment is made safe**: a callback is only a *trigger*. Before crediting anything the API asks Safaricom directly (STK Query) and checks the amount; callbacks carry a secret in the URL; events are de-duplicated; a 30-second reconciliation job catches lost callbacks; money that arrives for a booking that no longer needs it is refunded automatically. Every movement is a balanced, idempotent ledger entry.

**Tuning (platform settings, KES cents)**: `payments.escrow_enabled`, `payments.direct_enabled`, `wallet.min_topup_minor`, `wallet.max_topup_minor`, `wallet.min_balance_minor`, `wallet.low_balance_alert_minor`, `addon.expiry_minutes`.

**Ops runbook**: a payout stuck in `processing` after a Safaricom queue timeout is flagged in Admin and never retried automatically (a late success would pay twice). Verify in the M-Pesa portal, then `POST /admin/settlements/:id/retry`. Top-ups paid by bank transfer: `POST /admin/wallets/:professionalId/adjust` with `{amount, reason}`.

## 7. Honest status
Built without network access in the authoring environment: all 279 TS/TSX files parse and the 31 domain tests pass, but `tsc` type-checking, `next build`, booting the API and running the SQL against a live database were **not** executed here. Expect a short first round of fixes when you run `npm install`, `npm run build:api` and `npm run build:web`; send me the output and I'll fix it.
