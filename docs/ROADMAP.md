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
2. **Learner core (complete — see verified checkpoint below).** Catalog/details/dashboard, frozen task snapshots, start/resume attempts, clock-delivered events, materials, draft save, atomic final submission. Ownership, double submit, missing simulations and incomplete submissions are covered by integration tests.
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

## Final assessment checklist (satisfied — evidence in the Phase 10–12 checkpoints below)

- [x] Full platform runs locally and learner journey works end to end (API-level integration tests **and** a real-browser walkthrough: mobile at 390x844, RTL direction, and a live E2E script per role).
- [x] Register/login/logout with secure sessions and hashed passwords.
- [x] Browse/search/detail/start/resume/save/submission workflows.
- [x] Two complete, realistic simulations for different roles.
- [x] At least one connected dynamic requirement change (both simulations have one; event-gated rubric criteria).
- [x] Explainable deterministic evaluation; presence is not correctness.
- [x] AI submission reviewer works with a real provider (Gemini adapter; live check via `npm run ai:check`; validated, cached, advisory).
- [x] AI skill coach works with a real provider (same adapter; evidence-based; simulation slug whitelisted).
- [x] Both AI features have tested safe failure behavior; never do learner work (no key, timeout, malformed output, provider error, rate limit — all render neutral unavailable states; prompts forbid doing the task).
- [x] AI prompts, validation, advisory limits, caching and costs documented (`docs/AI.md`).
- [x] Non-AI decisions documented against actual implementation (`docs/ARCHITECTURE.md` ADRs + `docs/OUT-OF-SCOPE.md`, both describing shipped code).
- [x] Evidence includes work, reasoning, problem handling, skills, and feedback (skills and event timeline live; human/AI feedback arrive with phases 5–6).
- [x] Mentor workflow and human feedback (queue/detail/review, plus the learner-side mentor feedback section).
- [x] Employer evidence workflow with server-enforced sharing consent.
- [x] Admin create/edit/material management/activate/deactivate (Phase 10; role-gated API, no delete for simulations/tasks, task edits snapshot-isolated from history).
- [x] Full English and Arabic core flows, correct RTL/LTR (mobile RTL verified in a real browser).
- [x] Mobile workspace verified in a browser (phone viewport; no horizontal overflow on any pane).
- [x] Ownership, roles, input validation and error states verified — HTTP authorization matrix in the suite (anonymous 401; cross-role 403; learner A → learner B 404; mentor → unassigned 404; employer → unconsented/revoked 404), validation caps and double-submit tests, and per-locale error codes (`form-errors.ts`) rendered with `role="alert"`.
- [x] Secrets protected; ignored environment/database/generated files verified — `git ls-files` tracks `.env.example` only; `.env`, `.env.*`, `*.db*`, `dist/`, `node_modules/`, `*.log` are ignored; no key or credential appears in any tracked file.
- [x] Meaningful reviewed Git commits, no secrets, GitHub remote when provided — one focused commit per phase; the configured `origin` remote now holds `main` (push succeeded: `[new branch] main -> main`). No secret, database or build artifact has been committed at any point.
- [x] Complete implementation-specific README and architecture documentation — README (setup, environment table, checks, all four roles, workflows, AI boundaries, demo walkthrough) plus `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/ENVIRONMENT.md`, `docs/OUT-OF-SCOPE.md` and `screenshots/README.md`.
- [x] Ten required real screenshots with user/purpose descriptions — captured from the production build by `scripts/capture-screenshots.mjs` (asserts text direction and rejects duplicates), listed with viewport, route, demo data and AI mode in `screenshots/README.md`.
- [x] Tests/typecheck/lint/build pass for final product — `npm run check` exits 0: ESLint `--max-warnings 0` clean, **96 tests in 12 files**, three TypeScript projects, client + server production build.
- [x] Deployment configuration and storage limitations documented and tested where possible — `docs/ENVIRONMENT.md` covers the SQLite limits (single instance, persistent disk), the PostgreSQL migration path, the same-origin build, `COOKIE_SECURE=auto` and reverse-proxy TLS. Exercised locally in production mode by the smoke and E2E scripts; **no hosting deployment was performed** (no hosting account in scope), and the README says so.
- [x] Code is explainable; interview/demo walkthrough prepared — "Demo walkthrough" section in the README: eight ordered steps across all four roles, plus the honest caveats to raise when asked.

## Phase 12 checkpoint — final audit

Every checklist item above was re-verified against the shipped code and live behaviour, not inferred from earlier phases:

| Area | Evidence |
| --- | --- |
| Quality gates | `npm run check` exit 0 — ESLint `--max-warnings 0` clean, **96 tests in 12 files**, three TypeScript projects, production build |
| HTTP smoke | `node scripts/smoke.mjs` — health JSON, home HTML, built JS asset, API 404 |
| Mentor loop | `node scripts/e2e-mentor-learner.mjs` — 13/13 live (queue, full work product, cached AI, completed review published to the learner with the reviewer's name, pending state, cross-learner 404) |
| Employer evidence | `node scripts/e2e-employer.mjs` — 22/22 live (role gates, consent scoping, IDOR-as-404, read-only surface, Arabic payload, SPA refresh) |
| Admin catalog | `node scripts/e2e-admin.mjs` — 6/6 live (401/403 matrix, create/read/edit, deactivation hides it from the public catalog) |
| Localization | `node scripts/e2e-locale.mjs` — 6/6 live (registered preference applied after sign-in, Arabic catalog content) |
| Mobile workspace | `node scripts/e2e-mobile-workspace.mjs` — 16/16 in real Chrome at 390x844 (no overflow on any pane, 44px targets, draft survives reload, RTL) |
| Dev/demo switches | `node scripts/e2e-demo-assign.mjs` (both conveniences on in dev) and `node scripts/e2e-demo-assign-guard.mjs` (both **off** in production) |
| Demo accounts | `node scripts/verify-demo-accounts.mjs` — all four roles sign in with the correct role |

Findings this audit produced (all fixed, none hidden):

1. `npm run lint` was red: `scripts/capture-screenshots.mjs` legitimately uses browser globals inside `page.evaluate()`, which the default Node globals rejected. It now shares the existing `eslint.config.js` browser-globals override already documented for the mobile E2E script — no rule disabled.
2. Two E2E scripts were order-dependent. `e2e-employer.mjs` asserted the evidence list held exactly one row and read `[0]`; `e2e-mentor-learner.mjs` read `queue[0]`. Both assumptions are false on a working dev database, which legitimately accumulates submissions from walkthroughs and dev auto-share. Both now select the **seeded** record explicitly and fail loudly (`run npm run db:seed`) if it is missing — stricter than before, since they can no longer pass by accident against an unrelated row.
3. Incomplete ARIA tab pattern in the mobile pane switcher (recorded in the Phase 10 checkpoint above; the strip is now an `aria-pressed` toggle group).

Remaining limitations, stated plainly rather than hidden:

- `npm audit` produced **no verdict** in this environment (the registry retired the quick-audit endpoint → 400; the bulk advisory endpoint → 503). The dependency surface is small, pinned and lock-committed, but no claim of "zero known vulnerabilities" is made from a run that never completed.
- No hosting deployment was performed (no hosting account in scope). The production path is exercised locally against the compiled server only; `docs/ENVIRONMENT.md` and the README state this.
- The client bundle keeps the ~560 kB chunk-size warning; code-splitting is a deliberate omission, not an oversight.
- The dev database accumulates submissions from repeated E2E runs; that is expected, and is why the E2E scripts pin the seeded record. Reset with `rm prisma/worksim.db* && npm run db:deploy && npm run db:seed`.

No requirement is left unchecked and none was declared successful on the basis of an untested claim.


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
- The evaluation module was an uncommitted draft at this point; it has since been completed and verified in the learner-core checkpoint below.

## Verified learner-core checkpoint — 2026-09-18 (Phase 2 complete)

- **Deterministic evaluation engine** (`server/evaluation/rubric.ts`, 7 unit tests): objective per-field checks (nonEmpty, minLength, includesAny/All with Arabic signal words, hasNumber); event-gated criteria are skipped and excluded from the maximum, so a learner is never scored on a requirement that never reached them; every criterion carries machine-checkable evidence text in the stored result.
- **Bilingual simulation catalog in code** (`server/simulations/`): NovaShop (frontend debugging) and MarketFlow (sales-decline analysis), each with 3–4 realistic materials, 2 timed in-simulation events (each simulation includes one connected requirement change: guest-checkout scope addition; quantified-recovery request), one task with explicit submission fields and a rubric totaling 100. Synced idempotently by `syncCatalog()` — the same path used by seed and tests.
- **Learner-core API**: public localized catalog + detail; `POST /simulations/:idOrSlug/start` is idempotent (resume, not duplicate); attempt workspace serves the **frozen task snapshot** and clock-delivered events exactly once (`AttemptEvent` ledger); draft PATCH validates against the task's own field schema (unknown keys dropped, 20k cap, required-field errors by code); submit is transactional and single-shot (409 on retry), evaluates deterministically, writes submission + evaluation + demonstrated skills (only when their rubric criterion was met, each with a stored basis) in one transaction.
- **Evidence**: submissions endpoint returns localized work, per-criterion evaluation (including `skipReason`), skills with basis, and the **timeline of delivered events** — the "how did they handle change" record.
- **Authorization**: attempts/submissions queries are scoped by `userId` in the query itself; stranger reads a foreign attempt or submission → 404 (no existence leak); anonymous → 401. Covered by integration tests.
- **Client**: catalog with search + skill filter, simulation detail with brief/materials, workspace (autosaved debounced drafts with save-state indicator, polling inbox that merges only server-owned state, client-side required-field guard, confirm-then-submit), evidence page (score, criteria with evidence, skills, timeline, disclaimer), dashboard with in-progress/completed lists. All pages bilingual; state uses a load-key pattern to satisfy the strict react-hooks lint rules without resetting state inside effects.
- **Verification**: `npm run check` green — ESLint zero warnings, **40 tests** (16 auth/foundation + 7 rubric + material-migration + 13 learner-flow integration + dictionary/form-error parity), three-project typecheck, client+server build, production HTTP smoke passed. Rubric weights verified: NovaShop max 100; MarketFlow max 100 (weights normalized during this phase); event-skipped submission scores against max 90.
- **Known deferrals**: bundle is 557 kB (React Router included) — chunk warning stands, code-splitting deferred; mobile and RTL need real-browser verification (scheduled phases 8–9); no AI yet (phase 5).

## Phase 10 checkpoint — quality

Quality gates over the full product (96 tests at the close of the phase):

- **Tests (96, 12 files)**: auth/foundation, rubric unit, material migration upgrade, learner-flow integration (ownership, double-submit, validation caps), AI (parse/timeout/no-key/malformed/rate-limit with test doubles + live `npm run ai:check` for the real provider), mentor (11 HTTP: queue scoping, review lifecycle, demo auto-assign on/off/hijack-guard), employer (10 HTTP: role gates, consent/revocation/IDOR-as-404, payload safety, read-only surface, auto-share on/off/revoked), admin (6 HTTP: 401/403 matrix, CRUD, deactivation hides from public catalog, duplicate slug 409, malformed task JSON 400, no-delete invariant), dictionary parity, form errors.
- **Typecheck**: three projects (client, server, test config) clean.
- **Lint**: ESLint zero warnings, `--max-warnings 0` enforced in the check script.
- **Build**: Vite client build + server tsc; production HTTP smoke (`node scripts/smoke.mjs`) green.
- **Security review**: scrypt password hashing; sessions stored as SHA-256 token hashes in HttpOnly SameSite cookies (Secure in production via `COOKIE_SECURE=auto`); rate-limited auth; helmet headers; 64 kB JSON body cap; generic credential errors; `.env`/`*.db`/`dist` git-ignored and verified untracked; demo password sourced from env, never committed; no client-trusted roles (register hard-codes LEARNER); every staff query scoped inside the WHERE clause ("the query is the check"), so guessed ids are indistinguishable 404s; CSRF posture = SameSite=Lax cookies + same-origin-only API (no cross-origin writes possible; documented).
- **Authorization review matrix** (covered by tests): anonymous → 401 everywhere protected; learner/mentor/employer/admin cross-role access to another role's endpoints → 403; learner A → learner B's attempt/submission → 404; mentor → unassigned learner's submission → 404 (reads and writes); employer → unconsented/revoked submission → 404; admin-only: catalog mutations; dev-only auto-assign/auto-share verified OFF in production mode by `scripts/e2e-demo-assign-guard.mjs`.
- **UX review**: load-key state pattern everywhere (no cross-locale state bleed); loading, empty, network-error and 404 states on every data page; destructive submit is confirm-guarded; save-state indicator on drafts; bilingual date/time formatting.
- **Accessibility basics**: skip link; landmarks (`header/main/nav/section` with `aria-labelledby`); visible `:focus-visible` outlines; 44px+ touch targets (verified in a real browser); `aria-invalid` + `role="alert"` on form errors; `aria-live` on result counts and pending badges; `aria-pressed` pane toggles on mobile; `<html lang/dir>` mirroring for RTL; `dateTime` attributes on timestamps.
  - **Finding and fix (Phase 10):** the mobile pane switcher used `role="tablist"` + `role="tab"` with `aria-selected` but no `tabpanel`/`aria-controls` and no arrow-key handling — an incomplete ARIA tab pattern. Since the three panes are all visible on desktop (the strip is `display:none` there), they are not tabpanels, so it is now an `aria-pressed` toggle group: fewer roles, nothing announced that controls nothing.
- **Error states**: machine-readable error codes translated per locale (`form-errors.ts`); AI unavailable states never block the page; inbox polling failures degrade silently to the last good state; draft save errors show a retryable indicator without losing input.
- **Lint finding and fix**: `scripts/capture-screenshots.mjs` legitimately uses browser globals inside `page.evaluate()`, which the default Node globals rejected; it now shares the existing browser-globals override already documented for the mobile E2E script (`eslint.config.js`), so `--max-warnings 0` is green without disabling a rule.
- **Dependency review (honest limitation)**: `npm audit` cannot complete in this environment. The registry retired the quick-audit endpoint (`400 Bad Request` **from the registry**, before any project data is evaluated) and the bulk advisory endpoint returns `503`. No claim of "zero known vulnerabilities" is made from a run that never produced a verdict. What *is* verified statically: four runtime dependencies only (`@prisma/client`, `dotenv`, `express`, `helmet`), a committed lockfile, and `npm install` reporting the tree up to date. Re-run `npm audit` when the registry endpoint is healthy.

Known deferrals: client bundle remains ~560 kB (React Router included) — code-splitting intentionally deferred as it adds no assessment value; password reset/email delivery out of scope by design; no hosting deployment performed (no account/credentials supplied), so the smoke/E2E scripts exercise the production build locally instead.

## Phase 11 checkpoint — documentation

- **README**: rewritten for the implemented product — setup, env table (every variable in `.env.example`), checks, demo accounts (all four roles + password location), learner/mentor/employer/admin workflows, dev/demo auto-assign + auto-share switches (and why production never does either), localization, mobile verification, AI boundaries, admin catalog rules.
- **docs/ARCHITECTURE.md**: ADRs now reflect shipped decisions (monolith, Prisma/SQLite and the PostgreSQL migration path, code-authored curriculum + admin DB layer and the reseed-overwrites trade-off, consent model, AI adapter shape, task-snapshot immutability).
- **docs/AI.md** *(new)*: prompts (full text and why each rule exists), response schemas and validation, caching via inputHash/promptVersion, failure taxonomy (AI_NOT_CONFIGURED/TIMEOUT/PROVIDER_ERROR/RATE_LIMITED/INVALID_RESPONSE) with user-facing behavior, cost bounds (caps on input evidence, output chars, per-user rate limits), and what AI deliberately never does.
- **docs/ENVIRONMENT.md** *(new)*: every environment variable, defaults, security notes (`COOKIE_SECURE=auto`, `SEED_DEMO_PASSWORD` rotation before any real deployment), database file location and SQLite deployment limitations (single instance, persistent disk), and the deployment story (same-origin build, reverse-proxy TLS).
- **docs/OUT-OF-SCOPE.md** *(new)*: the mocked/intentionally-absent features list (email, password reset, payments, messaging, recruitment CRM, file uploads, multi-task simulations, code execution) — each with the reason it stays out.
- **screenshots/**: all ten required screenshots **captured** from the real running product (production build, seeded demo data, real Chrome via `playwright-core`) by `scripts/capture-screenshots.mjs`, which refuses to save a page whose rendered text direction does not match the requested locale and refuses duplicates (a duplicate means a capture silently failed). `screenshots/README.md` is the per-file log: viewport, route, demo data and AI mode for each shot, plus the honest note that shot 05 shows *stored* feedback for that submission (and the seeded row is stamped `seed:demo`).

## Phase 9 checkpoint — mobile workspace

The workspace is the mobile-first screen, and its layout is now verified in a real browser (`scripts/e2e-mobile-workspace.mjs`, Chrome at a 390x844 phone viewport against the built production app; 16 checks, all passing).

- **Pane tabs.** Below 900px the two columns collapse into one pane at a time behind a `Work / Messages / Materials` toggle strip (`aria-pressed` buttons, 44px targets, the inbox shows its message count). Above 900px the strip is hidden and both columns are visible, as before — one set of markup, switched purely in CSS.
- **Readable materials.** The desk was a title-only list, which left the bug report and the acceptance criteria unreadable. Materials are now expandable in place: prose wraps (`white-space: pre-wrap`), code keeps its formatting and scrolls internally.
- **No horizontal overflow.** Verified on the work, messages and materials panes, in both LTR and RTL (`scrollWidth === clientWidth === 390`).
- **Usable controls.** Save/submit remain 44px+ tall and full-width on narrow screens; draft autosave round-trips through a reload from a phone viewport.
- **Real-browser discipline.** `playwright-core` drives the browser already installed on the machine (no ~150MB download). The checks assert geometry and behaviour that unit tests cannot: overflow, pane visibility, tappable target size.
- **One real fix found by the browser.** Log out reused the `language` class, so the two header buttons were indistinguishable to selectors and assistive tech; log out now has its own `nav-button` class (identical styling).

Evidence: `screenshots/09-mobile-workspace.png` (captured from this run).

## Scope discipline

No payments, social network, chat system, recruitment integration, autonomous AI worker, or arbitrary code execution. Text/code proposals and supplied CSV materials are sufficient for the assessment. If uploads are later justified, implement size/type/storage validation first. Email delivery/password recovery are outside the initial scope and must not be implied to exist.
