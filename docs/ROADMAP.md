# WorkSim delivery roadmap and acceptance ledger

Never infer completion from a scaffold or mock response. Update this file after each verified phase. Each phase ends with review, tests, typecheck, lint, build, and a focused commit where Git identity is available.

## Discovery

- [x] Inspect repository: initially empty, no existing Git history or useful code.
- [x] Verify Node 22.20.0, npm 10.9.3, Git 2.51.0.
- [x] Define architecture, data/API boundaries, two scenarios, AI boundaries, and phased plan.
- [x] Initialize Git on main; no remote supplied.
- [x] Configure user-approved Git author identity and create first verified commit.

## Phases and exit gates

1. **Foundation (complete — see verified checkpoint below).** Buildable React/Express scaffold; full product schema with migration history; scrypt password hashing; DB-backed sessions in HttpOnly cookies; role authorization middleware; rate-limited register/login/logout; integration and authorization tests; React Router client with auth context and learner dashboard; demo seed. Ownership checks belong to the attempt/submission phase; explicit CSRF review is scheduled with security work in the quality phase.
2. **Learner core.** Catalog/details/dashboard, content versioning, start/resume attempts, materials, draft save, atomic final submission. Test ownership, concurrent saves, double submit, missing/disabled simulations.
3. **NovaShop.** Complete bilingual bug brief/source/reference materials, realistic manager update at a documented milestone, decision log, patch proposal/test-plan submission, explainable rubric. Do not run submitted code.
4. **MarketFlow.** Complete bilingual brief and synthetic CSV with verified totals, data dictionary, calculations, findings, recommendations, limitations. Test expected metric calculations and sensible tolerances. Both scenarios fully playable.
5. **AI.** Actual provider adapter, structured reviewer and coach, server schema validation, careful prompts, evidence-version caches, input/output/token/call bounds. Test unavailable key, malformed output, timeout, API failure and rate limits. Live provider verification is distinct from test doubles.
6. **Mentor.** Authorized queue, submission/context/AI visibility, human feedback, reviewed state; integration tests.
7. **Employer.** Learner opt-in sharing, safe candidate listing, approach/events/submission/evaluation/feedback evidence. Test nonconsenting candidates remain private.
8. **Localization.** Complete EN/AR for all core flows, materials, validation errors and feedback presentation; language switch and RTL verification. Do not translate only landing.
9. **Mobile.** Workspace tabs/material access, readable instructions, usable save/submit, no horizontal overflow at narrow widths; real browser verification.
10. **Quality.** Full auth-to-evidence journeys, admin catalog management, server authorization matrix, validation/error handling, accessibility review, security/dependency review, lint/test/typecheck/build.
11. **Documentation.** Actual schema/table explanations, APIs, AI prompts/failure/costs, non-AI choices, deployment/env, mocked/out-of-scope features, final running-system screenshots with descriptions.
12. **Final audit.** Compare every requirement below to implementation and test/demo evidence. No success declaration with unchecked requirements.

## Final assessment checklist (not yet satisfied)

- [ ] Full platform runs locally and learner journey works end to end.
- [x] Register/login/logout with secure sessions and hashed passwords.
- [ ] Browse/search/detail/start/resume/save/submission workflows.
- [ ] Two complete, realistic simulations for different roles.
- [ ] At least one connected dynamic requirement change.
- [ ] Explainable deterministic evaluation; presence is not correctness.
- [ ] AI submission reviewer works with a real provider.
- [ ] AI skill coach works with a real provider.
- [ ] Both AI features have tested safe failure behavior; never do learner work.
- [ ] AI prompts, validation, advisory limits, caching and costs documented.
- [ ] Non-AI decisions documented against actual implementation.
- [ ] Evidence includes work, reasoning, problem handling, skills, and feedback.
- [ ] Mentor workflow and human feedback.
- [ ] Employer evidence workflow with server-enforced sharing consent.
- [ ] Admin create/edit/material management/activate/deactivate.
- [ ] Full English and Arabic core flows, correct RTL/LTR.
- [ ] Mobile workspace verified in a browser.
- [ ] Ownership, roles, input validation and error states verified.
- [ ] Secrets protected; ignored environment/database/generated files verified.
- [ ] Meaningful reviewed Git commits, no secrets, GitHub remote when provided.
- [ ] Complete implementation-specific README and architecture documentation.
- [ ] Ten required real screenshots with user/purpose descriptions.
- [ ] Tests/typecheck/lint/build pass for final product.
- [ ] Deployment configuration and storage limitations documented and tested where possible.
- [ ] Code is explainable; interview/demo walkthrough prepared.

## Verified scaffold checkpoint — 2026-09-17

- `npm run check` passed: ESLint zero warnings, 6 tests across 2 files, client/server TypeScript, Vite production build and server compilation.
- `node scripts/smoke.mjs` passed against the compiled production process: health JSON, home HTML, built JS asset and API 404; process stopped afterward.
- `npm audit --audit-level=moderate` reported zero vulnerabilities after pinning Vitest 4.1.11. ESLint upgraded to supported 10.x.
- npm 10.9.3 hit an `edgesOut` resolver error during the Vitest upgrade; a one-off `npx --yes npm@11 install -D --save-exact vitest@4.1.11` succeeded. Global npm was not changed. Manifest and lockfile are retained. Clean `npm ci` reproducibility has not yet been retested.
- A disk-full error interrupted an earlier install attempt. Latest measured available space: 168 MiB. Free adequate disk space before database/browser dependency installation; no personal files or shared caches were deleted.
- Git ignores local env files, databases, dependencies and build output. Git is on main without commits: author identity is not configured. No remote was supplied.
- Browser rendering, mobile layout, actual language switching and accessibility are not yet verified; translation tests only establish key parity and nonempty strings.

## Verified foundation checkpoint — 2026-09-17 (Phase 1)

- Data layer: complete product schema (users/sessions, simulations, tasks, materials, events, attempts, submissions, evaluations, AI feedback, skills, mentor reviews, employer sharing) committed with a reproducible migration; `prisma migrate status` clean; `db:seed` created the four demo accounts.
- Auth: register/login/logout/me with Zod validation, Node-built-in scrypt hashing, sessions stored as SHA-256 token hashes and referenced by an HttpOnly cookie, generic credential errors, login rate limiting with Retry-After, requireAuth/requireRole middleware. Public registration always creates learners; staff roles come from the seed only.
- Client: React Router shell, locale provider with RTL/LTR switching, auth context, landing/login/register/dashboard/not-found pages, EN/AR dictionary with key-parity and non-empty tests, API-code-to-message mapping for form errors.
- Verification: `npm run check` green (ESLint zero warnings, 19 tests, three-project typecheck, client+server build). Live E2E against the production build: seeded login 200, `/me` 200 with cookie, wrong password 401 `INVALID_CREDENTIALS`, cookieless `/me` 401. `scripts/smoke.mjs` passed.
- Deferred with reasons: ownership checks arrive with attempts/submissions; email delivery and password reset are out of scope; explicit CSRF review is scheduled in the quality phase.

## Phase 2 checkpoint — bilingual material persistence

- Added a second migration; the applied foundation migration remains unchanged. `SimulationMaterial.content` becomes `contentEn` and `contentAr`.
- Existing text is copied to both columns to prevent data loss. This is a legacy fallback, NOT an Arabic translation; scenario seed content must author both narrative languages.
- An isolated upgrade test applies the original migration, inserts an existing material, applies the new migration, and verifies exact text, ordering, relationships, foreign-key integrity and cascade deletion.
- Verified: schema validation; 20 tests; lint; typecheck; production build and HTTP smoke. Local migration deployment and client generation succeeded; database-to-schema diff reports no difference. No development database reset was used.
- Build still reports a 509 kB client-chunk warning; optimization remains outstanding.
- The evaluation module is an uncommitted draft, not yet integrated or covered by dedicated tests. Catalog, attempts, submissions and playable simulations remain incomplete; this checkpoint does not close Phase 2.

## Scope discipline

No payments, social network, chat system, recruitment integration, autonomous AI worker, or arbitrary code execution. Text/code proposals and supplied CSV materials are sufficient for the assessment. If uploads are later justified, implement size/type/storage validation first. Email delivery/password recovery are outside the initial scope and must not be implied to exist.
