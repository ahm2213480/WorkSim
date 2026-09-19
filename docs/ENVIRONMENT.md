# Environment and deployment

Every variable lives in `.env.example` (copy to `.env`; **never commit `.env`**). The server validates all configuration once at startup (`server/env.ts`); a bad value fails fast with the exact field names.

## Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables serving the built frontend + `COOKIE_SECURE=auto` Secure cookies |
| `PORT` | `3001` | API/server port (Vite dev proxy targets this) |
| `HOST` | `127.0.0.1` | Bind address; `0.0.0.0` on a hosting service |
| `DATABASE_URL` | `file:./worksim.db` | SQLite file URL, **relative to the `prisma/` folder** (Prisma convention — the actual file is `prisma/worksim.db`) |
| `COOKIE_SECURE` | `auto` | `auto` = Secure cookies in production only; `false` solely for local production-mode HTTP testing; `true` to force |
| `AUTH_RATE_LIMIT` | `30` | Max register/login attempts per IP per window (in-memory, single instance) |
| `SEED_DEMO_PASSWORD` | `Worksim-demo-1` | Password for the four seeded demo accounts. **Rotate or remove them before any real deployment** |
| `DEMO_AUTO_ASSIGN_MENTOR` | `auto` | Dev/demo only: `auto` = on in development (submit assigns a mentor-less learner to the seeded mentor), `true`/`false` to force. Production never auto-assigns |
| `DEMO_AUTO_SHARE_EVIDENCE` | `auto` | Dev/demo only: `auto` = on in development (submit shares evidence with the seeded employer), `true`/`false` to force. Production never auto-shares — consent is explicit there |
| `AI_API_KEY` | *(empty)* | Gemini API key. **Leave empty to run fully without AI** — the platform works and shows neutral "unavailable" states |
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint |
| `AI_MODEL` | `gemini-3.5-flash-lite` | A low-cost Flash model is sufficient (small structured JSON in/out) |
| `AI_TIMEOUT_MS` | `30000` | Hard per-request provider timeout; a slow provider must never pin a request |

Secrets: the only secret is `AI_API_KEY` (and the demo password). Both stay server-side; the key is never sent to the browser, and AI prompts never include it.

## Database

- SQLite via Prisma, file at `prisma/worksim.db` (test suite uses `prisma/test.db`). Migrations in `prisma/migrations`; `npm run db:deploy` applies them, `npm run db:seed` syncs the code-authored catalog and creates demo accounts (idempotent).
- **Seed semantics**: `syncCatalog()` republishes simulations authored in `server/simulations/*.ts` on every seed run — a reseed **overwrites database edits to seeded rows** (materials are replaced wholesale; tasks/events are upserted by stable key so learner attempts are never repointed). Admin-created (non-seeded) simulations are untouched. This trade-off is stated in the admin UI.
- **SQLite deployment limitations**: single backend instance (no horizontal scaling), persistent disk required (an ephemeral/serverless filesystem will lose the database), full-text/concurrency limits are acceptable at demo scale. PostgreSQL is the production alternative: change the datasource block, review raw SQL and migrations, re-run the suite — not just a URL swap.

## Running

```sh
npm ci            # install + prisma generate
npm run db:deploy # apply migrations
npm run db:seed   # demo accounts + catalog
npm run dev       # API (3001) + Vite (5173) with /api proxy
```

Production: `npm run build` (typecheck + Vite build + server tsc), then `NODE_ENV=production npm start` — Express serves `dist/client` and `/api` on **one origin**. Same-origin by design: no CORS layer, cookies never leave the origin. TLS terminates at the reverse proxy (`COOKIE_SECURE=auto` then marks cookies Secure). A split deployment must proxy `/api` to the backend; do not add permissive CORS instead.

## Checks

```sh
npm run check        # lint + tests + build
node scripts/smoke.mjs          # production HTTP smoke (needs build)
node scripts/verify-demo-accounts.mjs  # all four demo roles sign in
npm run ai:check                # live provider check (needs AI_API_KEY)
```

E2E scripts (each boots the compiled server on port 3199): `e2e-admin`, `e2e-demo-assign` (dev behavior), `e2e-demo-assign-guard` (production invariant), `e2e-employer`, `e2e-locale`, `e2e-mentor-learner`, `e2e-mobile-workspace` (real Chrome, needs `playwright-core` + installed browser).
