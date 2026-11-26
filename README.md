# FundiLink: Web + API

Contains everything server-side and browser-side. The **mobile app is a separate zip** (`fundilink-mobile.zip`) and talks to the API in this one.

| Path | What |
|---|---|
| `apps/api` | NestJS REST + Socket.IO API (PostgreSQL/PostGIS, Redis/BullMQ, double-entry ledger, provider adapters) |
| `apps/web` | Next.js: public site, `/app` customer, `/professional`, `/admin`, `/enterprise` |
| `packages/domain` | Pure business rules with tests (booking state machine, pricing, ranking, scheduling, geo, reviews, ledger) |
| `packages/sdk` | Typed API client |
| `db/` | `001_schema.sql`, `002_seed.sql`, `003_extensions.sql` (run in this order) |

**Start here: [SETUP.md](SETUP.md)** (local run, demo accounts and en-route test, Railway CLI deploy, domain, every env variable, Google sign-in).

## Run
```bash
cp .env.example .env              # set secrets + provider keys
docker compose up -d              # Postgres+PostGIS (auto-runs db/*.sql in order) and Redis
npm install
npm test                          # 31 domain tests, no DB needed
npm run dev:api                   # http://localhost:4000
npm run dev:web                   # http://localhost:3000
```
If you do not use docker's auto-init: `npm run db:migrate`.
Web env: copy `apps/web/.env.example` to `apps/web/.env.local`.

## Deploy (Railway)
API: `railway.json` start command. Web: separate Railway service, root `apps/web`, `npm run build && npm start`. Add Postgres (with PostGIS) and Redis plugins; set every variable from `.env.example`.

## Before any real money moves
1. Confirm the funds-holding / split-settlement arrangement with a **licensed payment provider** (CBK-authorised) and write its adapter (`apps/api/src/providers/providers.ts`, `PaymentProvider`). Only a mock provider ships.
2. Sandbox-test webhooks, refunds and payouts end to end; reconcile the ledger against provider reports.
3. Review Kenya Data Protection Act (ODPC registration), KRA/eTIMS, and category licensing rules with a lawyer.
4. Change every `change-me` secret (the API refuses to boot in production with placeholders).

## Honest status
This codebase was assembled in an environment with **no package-install access and no Postgres**. What is verified: the 31 domain tests pass, and every TS/TSX file parses. What is **not** verified: `tsc` type-checking, `next build`, booting the API, and running the SQL against a database. Expect a first round of fixes on a normal machine: `npm install`, load the SQL, then fix whatever `tsc` / `next build` reports.
