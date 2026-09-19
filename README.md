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

| Variable   | Default       | Purpose                                                  |
| ---------- | ------------- | -------------------------------------------------------- |
| `NODE_ENV` | `development` | `production` enables serving the built frontend          |
| `HOST`     | `127.0.0.1`   | Use `0.0.0.0` on a hosting service if required           |
| `PORT`     | `3001`        | Backend listening port; dev proxy currently targets 3001 |

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

## Mentor review workflow

Mentors review the work of the learners assigned to them (`MentorAssignment`, provisioned by the seed/admin only — never self-granted through the API).

1. Sign in as `mentor@worksim.dev`. **Mentor reviews** (`/mentor`) lists every submission from assigned learners: learner name, simulation, submitted date, score and review status (`Not reviewed` / `Draft` / `Completed`).
2. **Open review** (`/mentor/:submissionId`) shows the same evidence record the learner sees — the full submitted work product (root-cause write-up, code fix, test plan, estimate), the deterministic evaluation, demonstrated skills, the recorded task timeline — plus the learner's cached AI feedback, read-only.
3. The mentor writes quality feedback and either **saves a draft** or **completes the review**. Drafts are the mentor's private working copy; completing publishes the review.

The learner side is connected end to end: the evidence page (`/evidence/:submissionId`) shows a **Mentor feedback** section that displays *"Pending mentor review"* until a review is completed, then renders the mentor's written feedback and the reviewer's name. Mentor feedback never changes the deterministic score.

Demo data (after `npm run db:seed`): the seeded learner's NovaShop submission carries a completed mentor review, so both the mentor queue and the learner's mentor-feedback section are populated out of the box.

**Dev/demo convenience — auto-assignment.** Accounts registered from the UI are always `LEARNER`, and mentor visibility is scoped by `MentorAssignment`, which is deliberately never created from a request. During a walkthrough that would leave a fresh tester's submission unreviewable, so in **development only** a learner who submits work without any mentor is automatically assigned to the seeded demo mentor (`mentor@worksim.dev`) at submission time — their work then appears in that mentor's queue immediately. The behaviour is controlled by `DEMO_AUTO_ASSIGN_MENTOR` (`auto` = development only, the default; `true`/`false` to force it). It is conservative by design: it does nothing when the demo mentor does not exist, it never replaces an assignment an admin already provisioned, and **production never auto-assigns** — so the security rule that review access is never self-granted is preserved.

**Dev/demo convenience — evidence auto-share.** The same walkthrough problem exists on the employer side: `EvidenceShare` is consent-based, so a fresh learner's submission would be invisible to the demo employer. In **development only**, submitting work also creates a share with the seeded demo employer (`employer@worksim.dev`), controlled by `DEMO_AUTO_SHARE_EVIDENCE` (`auto` = development only, the default; `true`/`false` to force it). It does nothing when the demo employer does not exist, it never touches an existing row — so a learner who revoked the grant is not re-subscribed — and **production never auto-shares**: consent stays explicit there.

## Employer evidence (Phase 7)

Employers inspect candidate work evidence — what the candidate produced, how they approached it, and how they handled changing requirements. The flow:

1. Sign in as `employer@worksim.dev` (demo password on the login page).
2. **Candidate evidence** (`/employer`) lists every completed submission a candidate shared with this employer: candidate name, simulation/company/role, score, demonstrated skills, and whether a mentor review is completed.
3. **View evidence** (`/employer/evidence/:submissionId`) shows the full narrative: candidate, assignment context, the submitted work, the deterministic evaluation with per-criterion evidence, demonstrated skills, the recorded task timeline (events the candidate handled), cached AI feedback (advisory), and completed mentor feedback.

Access rules, enforced on the server:

- Evidence is **consent-based** (`EvidenceShare`): an employer sees only submissions from learners who granted them access. There is no public candidate search; every query scopes on the active grant, so an unconsented or revoked id returns 404 indistinguishable from a missing one.
- The workflow is **read-only**: the employer router defines no write routes, and employer payloads exclude emails, password hashes, sessions and other private fields.
- AI feedback is shown only from the stored cache (READY rows) — viewing evidence never calls the AI provider, and missing AI or mentor feedback renders a neutral "not available" state without breaking the page.
- The deterministic evaluation is the platform's score of record; AI and mentor feedback are advisory context, not hiring recommendations.

Demo data (after `npm run db:seed`): the seeded learner's NovaShop submission is shared with `employer@worksim.dev` and carries a cached AI review and a completed mentor review, so all sections of the evidence page are populated.

## Localization (Phase 8)

The platform is fully bilingual (English/Arabic) with correct LTR/RTL:

- **Dictionaries**: every user-facing string lives in `client/messages.ts` with exact EN/AR key parity (enforced by a test). Server messages are never shown raw — pages translate by machine-readable error code.
- **Language switch**: the header switch flips EN⇄AR instantly, mirrors `<html lang/dir>` (RTL for Arabic), and persists the choice in `localStorage`.
- **Server-side locale resolution**: simulation/task/material/event/rubric content is stored as parallel EN/AR columns; every read endpoint accepts `?locale=EN|AR` and ships only the requested language.
- **Registered preference**: the account's registered language (`User.locale`, chosen at registration) is adopted automatically after login/session restore — unless the user has explicitly picked a language in that browser, which always wins.

## Mobile workspace

The simulation workspace is the mobile-first screen (the task is the product). Below 900px the two columns become a `Work / Messages / Materials` tab strip so the learner never scrolls past a long form to reach the team's messages or the task materials; above 900px both columns are visible at once, from the same markup. Task materials are expandable in place — the bug report and acceptance criteria are the task's inputs — with prose wrapping and code scrolling internally, so nothing widens the page.

Verified in a real browser, not just in tests: `node scripts/e2e-mobile-workspace.mjs` starts the built app and drives Chrome at a 390x844 phone viewport through login → start → panes → materials → draft save → reload → Arabic, asserting no horizontal overflow on every pane in both directions, tappable (44px+) save/submit, and that a draft survives a reload. Evidence: `screenshots/09-mobile-workspace.png`. The check uses `playwright-core` against the browser already installed on the machine (`CHROME_PATH` to override), so no browser download is needed.

## AI boundaries

Planned AI features are post-submission review and personalized skill coaching. Both will be server-side, advisory, validated, cached, and safe to fail without losing submissions. Actual provider/model/prompts/cost limits will be documented alongside implementation. No AI service is currently called.

AI is intentionally **not** used for authentication, authorization, CRUD, navigation, localization, search, validation, or objective calculation checks: deterministic software is cheaper, more predictable, and auditable. Presence of an explanation is not proof of technical correctness. No arbitrary learner code will be executed by the platform.

## Documentation and acceptance

- `docs/ROADMAP.md`: phased work and acceptance gates.
- `docs/ARCHITECTURE.md`: decisions and proposed data/API boundaries.
- `screenshots/README.md`: final capture plan; no fabricated screenshots.

The final README must expand with the actual schema, auth/security design, simulation rubric, AI prompts/output/failure/cost behavior, mentor and employer flows, test results, real screenshots, and deployment limitations. Those claims are intentionally not made before implementation.

## Demo accounts

Public registration only ever creates `LEARNER` accounts. Staff roles are
provisioned by `npm run db:seed` for the assessment walkthrough. Every demo
account uses the password shown on the login page (from `SEED_DEMO_PASSWORD`
in your local `.env` — the default is `Worksim-demo-1`; never commit `.env`):

| Role     | Email                | Opens in the app                  |
| -------- | -------------------- | --------------------------------- |
| Learner  | `learner@worksim.dev`  | Simulation workspace              |
| Mentor   | `mentor@worksim.dev`   | Mentor queue (`/mentor`)          |
| Employer | `employer@worksim.dev` | Candidate evidence (`/employer`)  |
| Admin    | `admin@worksim.dev`    | Admin area                        |

The seed also wires the demo walkthrough: `learner@worksim.dev` is assigned to
the demo mentor, shares evidence with the demo employer, and has a completed
submission with a cached AI review and a completed mentor review.
