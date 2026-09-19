# Architecture decisions

Status: implemented and shipped — the decisions below describe the running production system (all delivery phases verified, not proposals or scaffold).

## ADR 001 — Straightforward React / Express monolith

Chosen: React + TypeScript + Vite frontend; Express + TypeScript REST server, one package manifest and lockfile. Production serves the built frontend and API on one origin. Development uses Vite's API proxy.

Why: matches the assessment preference, keeps request handling visible, avoids unnecessary service boundaries. React hooks handle current local UI state; no state-management dependency is justified yet.

Alternatives: Next.js provides routing/server rendering but is unnecessary for this interactive assessment and obscures the explicitly requested frontend/backend separation. Microservices add deployment and debugging cost without benefit here.

Current code: `client` contains UI/dictionaries/styles, `server` contains app creation and process startup. Separating app creation from listening enables HTTP integration tests. `GET /api/health` is liveness only, not a claim that storage or AI is ready. Unexpected errors have generic client responses; request JSON has a size limit. Auth/authorization/CSRF/rate limiting are not implemented yet.

## ADR 002 — Relational storage without local infrastructure (planned)

Choose Prisma with SQLite for the initial demo. No PostgreSQL CLI was found; that alone does not prove no database server exists. SQLite is chosen for reproducible local setup, not because PostgreSQL is unsuitable.

SQLite deployment requires a persistent disk and single backend instance. An ephemeral/serverless filesystem is unsuitable. PostgreSQL is the production alternative for horizontal scaling; conversion requires deliberate schema/migration/config changes and retesting, not just replacing the connection URL.

Proposed relationships:
- User has a role enum, sessions, attempts, employer-sharing consent; public registration only creates learners.
- Session stores a hash of an opaque token and expiry. Token stays in an HTTP-only cookie. Plan password hashing with Node scrypt, same-origin mutation protection, secure cookies in production, login throttling, and server-side ownership checks.
- Simulation owns immutable published content versions. A version owns one complete task brief, materials, events, rubric, and skill mappings. A separate multi-task workflow is unnecessary for two single-assignment simulations.
- Attempt references a content version and learner, stores draft progress, and has activity/event records. Admin edits must not silently change an ongoing assignment or historical evidence.
- Submission is immutable, at most one per attempt; records the final work and evaluation context. Draft updates and submission transitions need transactional/concurrency protection.
- Evaluation stores explainable objective results. Qualitative review does not override objective outcomes.
- Skill mappings link rubric evidence to skill observations, not unproven mastery claims.
- AI review stores validated advisory output, provider/status metadata, and context version. Failure cannot roll back submission storage.
- MentorReview references mentor and submission, with feedback and review status.
- Coach output is cached against a version/hash of relevant completed evidence and feedback.

Employer evidence is a projection of these records, not a duplicated certificate. Default private; employer endpoints check consent on each request. Activity proves recorded platform actions only, not all off-platform work.

## Proposed routes and API

Pages: `/`, `/login`, `/register`, `/dashboard`, `/simulations`, `/simulations/:id`, `/attempts/:id`, `/submissions/:id`, `/coach`, `/mentor/submissions`, `/mentor/submissions/:id`, `/employer/candidates`, `/employer/candidates/:id`, `/admin/simulations`, `/admin/simulations/:id`.

API groups under `/api`:
- Auth: register/login/logout/me; no client-selected privileged roles.
- Simulations: public active catalog/details; authenticated learner start.
- Attempts: owner-only read/save/event acknowledgment/submit.
- Submissions: owner read, persisted review/retry with bounds.
- Coach: own evidence-based advice; cached and rate-limited.
- Mentor: authorized queue/detail/human review.
- Employer: consented candidate listing and evidence; restricted data projection.
- Admin: create/edit/publish/activate catalog content; explicit role checks.

## AI design (planned)

Use AI only for submission review and completed-evidence coaching. Prompts specify task context, rubric, supplied evidence, structured output, missing-vs-incorrect distinction, no fabricated facts, no task completion, and untrusted submission boundaries. Validate on server. Never expose keys. Bound input/output, request duration and retries, cache completed output, and show explicit unavailable states for missing key, timeout, rate limit, or invalid output. Store submissions before provider calls. Real-provider checks require a supplied key; deterministic test doubles must be labeled and cannot count as a live provider test.

## Localization and mobile

Current landing uses matching typed English/Arabic dictionaries, document lang/dir, persisted optional preference, logical spacing, keyboard focus, and responsive grids. Core flows will reuse localization rather than duplicate pages. Browser/mobile verification has not happened. The eventual workspace—not the landing—is the required mobile-first acceptance area.

## Testing strategy

Vitest and Supertest cover HTTP behavior; TypeScript checks client/server. Production smoke starts the compiled entry point. Add database/auth/role boundary integration tests before learner workflows. Later use actual browser verification for language switching, RTL, keyboard access, no horizontal overflow, save/submit and screenshots. Screenshot tooling will be selected when needed, not preemptively installed.
