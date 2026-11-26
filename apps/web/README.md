# @fundilink/web

Next.js 15 (App Router) + React 19 web app: public marketplace, customer (`/app`), professional (`/professional`),
admin (`/admin`) and enterprise (`/enterprise`) portals. All API traffic goes through `@fundilink/sdk`.

```bash
cp .env.example .env.local
npm install            # from the repo root (workspaces)
npm run dev:web        # http://localhost:3000, API expected at NEXT_PUBLIC_API_URL
```

**Status:** this code was written in an environment where `npm install` was blocked. It has only been syntax-checked
(TypeScript `transpileModule`); it has **not** been type-checked, built or run. Run `npm run typecheck -w @fundilink/web`
and `npm run build -w @fundilink/web` after installing, and expect a few small type fixes.

Notes
- Maps use Leaflet + OpenStreetMap tiles (no API key). Swap the tile URL in `src/components/Map.tsx` for Mapbox if desired.
- Tokens are kept in `localStorage` (the SDK's `TokenStore`). Route guards are UX only; the API enforces every permission.
- Pages that call endpoints outside the SDK use `api.get/post/put` directly (see `src/lib/extra.ts`).
