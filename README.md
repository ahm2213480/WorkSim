# WorkSim

Practice realistic work. Build evidence of how you think, what you produce, and how you handle changing requirements.

## Implementation status

**Phase 0 complete; Phase 1 scaffold implemented. The assessment product is not complete.**

Currently implemented: React landing preview, English/Arabic language switch and document direction, Express liveness endpoint, safe JSON errors, request size limits, security headers, build tooling, API tests, and a production HTTP smoke check.

Not implemented yet: database, authentication, playable simulations, saved work, evaluation, AI, mentor/employer/admin workflows. The landing page explicitly labels its scenarios as a development preview. It does not pretend they are playable.

## Local setup

Requires Node >=22.12 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to Express at http://127.0.0.1:3001.

Environment overrides are optional: copy `.env.example` to `.env` if needed. Never commit `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables serving the built frontend |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` on a hosting service if required |
| `PORT` | `3001` | Backend listening port; dev proxy currently targets 3001 |

Do not put secrets in frontend variables. AI and database configuration will be documented when implemented.

## Checks

```sh
npm run lint
npm test
npm run build
node scripts/smoke.mjs
```

`npm run check` runs lint, tests, typecheck, and build. The smoke check requires a prior build, starts the compiled production server on port 3199, requests health/HTML/JavaScript/API-404, then stops it. Set `SMOKE_PORT` to override its port. It is not a browser or mobile layout test.

## Production foundation

Run `npm ci`, `npm run build`, and `npm start` with `NODE_ENV=production` configured in the host environment. Express serves `dist/client` and `/api` on the same origin. A split frontend deployment must proxy `/api` to the backend; do not add permissive CORS as a shortcut. TLS is expected at the hosting reverse proxy. Deployment of the full product remains unverified.

## Product scope

Learners are the primary users: register → browse → enter a fictional company → investigate → save decisions → handle changes → submit → reflect → share evidence. Mentors add human oversight; employers inspect consented work evidence; admins manage simulation content.

Two required scenarios:
- **NovaShop / Junior Frontend Developer:** investigate mobile checkout failures, propose a patch, respond to a guest-checkout clarification, and provide a test plan.
- **MarketFlow / Junior Data Analyst:** analyze a synthetic sales dataset, explain a decline with reproducible calculations, and recommend action with limitations.

These are fictional companies, not real employer integrations. Their full materials and workflows are planned, not implemented.

## AI boundaries

Planned AI features are post-submission review and personalized skill coaching. Both will be server-side, advisory, validated, cached, and safe to fail without losing submissions. Actual provider/model/prompts/cost limits will be documented alongside implementation. No AI service is currently called.

AI is intentionally **not** used for authentication, authorization, CRUD, navigation, localization, search, validation, or objective calculation checks: deterministic software is cheaper, more predictable, and auditable. Presence of an explanation is not proof of technical correctness. No arbitrary learner code will be executed by the platform.

## Documentation and acceptance

- `docs/ROADMAP.md`: phased work and acceptance gates.
- `docs/ARCHITECTURE.md`: decisions and proposed data/API boundaries.
- `screenshots/README.md`: final capture plan; no fabricated screenshots.

The final README must expand with the actual schema, auth/security design, simulation rubric, AI prompts/output/failure/cost behavior, mentor and employer flows, test results, real screenshots, and deployment limitations. Those claims are intentionally not made before implementation.
