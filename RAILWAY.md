# Deploy FundiLink on Railway (no Docker, ~15 minutes)

**One Railway project, four boxes (called "services"):**

| Service | What it is | You create it by |
|---|---|---|
| `api` | the backend | deploying this repo |
| `web` | the website | deploying this repo again |
| `Postgres` | the database (must include PostGIS) | the PostGIS template |
| `Redis` | background jobs (optional) | + New > Database > Redis |

Seeing both `@fundilink/web` and `@fundilink/api` appear when you deploy the repo is **correct**: this repo holds two apps, so Railway offers one service for each. Keep them in the **same project**. The database is a third box, created from a template. You do not write a database folder or use Docker; Railway runs it for you.

> Delete the old `Dockerfile` if you still have one in the repo. It forces every service to build the website only, which is why the API never worked.

---
## Step 1: project + database
1. railway.com > **New Project > Empty Project**.
2. **+ New > Template**, search **PostGIS**, deploy it. (Plain "PostgreSQL" will NOT work: no PostGIS.) Note the service's exact name, e.g. `PostGIS`.
3. Optional: **+ New > Database > Redis**.

> **How the two services differ:** both build this same repo. The variable `SERVICE=api` or `SERVICE=web` tells it which app to build and start. If you ever see "No start command detected" or "SERVICE is not set", that variable is missing on that service.

## Step 2: API service
1. **+ New > GitHub Repo** (or `railway up` from the repo folder). If Railway shows two detected services, keep both. Rename them `api` and `web`.
2. **api > Settings**:
   - Optional: Healthcheck Path `/health`
   - Networking > **Generate Domain** (note the URL, e.g. `https://api-production-xxxx.up.railway.app`)
3. **api > Variables > Raw Editor**, paste (replace `PostGIS`/`Redis` with your service names, and the three secrets):
```
SERVICE=api
NODE_ENV=production
DATABASE_URL=${{PostGIS.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_ACCESS_SECRET=<random 1>
JWT_REFRESH_SECRET=<random 2>
FIELD_ENCRYPTION_KEY=<random 3>
PAYMENT_WEBHOOK_SECRET=<random 4>
PAYMENT_PROVIDER=mock
ENABLE_DEMO=true
SEED_DEMO_ON_BOOT=true
API_PUBLIC_URL=https://<your api domain>
PUBLIC_WEB_URL=https://<your web domain>
```
   Random values: run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` four times.
   No Redis? Leave `REDIS_URL` out.
4. Deploy. Open `https://<api domain>/health`: you should see `{"ok":true,...,"demo":true}`. The first boot creates all tables and the demo accounts (watch the Deploy Logs; takes ~1 minute). After it works, **delete `SEED_DEMO_ON_BOOT`**.

## Step 3: web service
1. **web > Settings > Networking > Generate Domain**.
2. **web > Variables**:
```
SERVICE=web
NEXT_PUBLIC_API_URL=https://<your api domain>
NEXT_PUBLIC_SITE_URL=https://<your web domain>
```
   These are baked into the site at build time: after changing them, click **Redeploy**.
3. Go back to **api > Variables** and make sure `PUBLIC_WEB_URL` equals the web domain, then redeploy api.

## Step 4: sign in
Open the web domain > Sign in > tap a demo account (password `Demo@12345`). Sign-in failing with "Can't reach the server at ..." means one of: API domain wrong in `NEXT_PUBLIC_API_URL` (fix and redeploy web), API not running (check `/health`), or `PUBLIC_WEB_URL` wrong.

## Step 5: your domain (when happy)
web > Settings > Custom Domain: `intonelenterprise.com`, `www.intonelenterprise.com`. api > Custom Domain: `api.intonelenterprise.com`. Add the DNS records Railway displays at your registrar. Then update: `NEXT_PUBLIC_API_URL=https://api.intonelenterprise.com`, `NEXT_PUBLIC_SITE_URL=https://intonelenterprise.com` (web, then redeploy), and `API_PUBLIC_URL`, `PUBLIC_WEB_URL=https://intonelenterprise.com,https://www.intonelenterprise.com`, `ROOT_DOMAIN=intonelenterprise.com` (api).

## Optional later
Google sign-in, Mapbox, SMS, email, storage: see SETUP.md sections 4 and 5. Before real customers: `ENABLE_DEMO=false`.

## CLI equivalents (only if you prefer the terminal)
```
npm i -g @railway/cli && railway login && railway link
railway up --service api
railway up --service web
railway logs --service api
```
