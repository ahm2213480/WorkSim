# WorkSim

Practice realistic work. Build evidence of how you think, what you produce, and how you handle changing requirements.

## Implementation status

**All twelve delivery phases are complete and verified.** `docs/ROADMAP.md` holds the per-phase checkpoints and the final acceptance checklist; `docs/OUT-OF-SCOPE.md` lists what is deliberately absent.

Working end to end: learner catalog → detail → workspace → submission → evidence; two playable bilingual simulations with timed requirement changes; explainable deterministic evaluation; AI submission reviewer and skill coach (validated, cached, advisory, safe to fail); mentor queue and human review with learner-visible feedback; consent-based read-only employer evidence; admin catalog management; full English/Arabic with correct RTL; browser-verified mobile workspace.

Every claim in this file is backed by an automated check (Vitest, TypeScript, ESLint, production build, HTTP smoke) or a real-browser/E2E script in `scripts/` — not by a scaffold or a mock response.

## Local setup

Requires Node >=22.12 and npm. From the repository root:

```sh
npm ci
npm run db:deploy   # apply migrations
npm run db:seed     # demo accounts + the code-authored catalog
npm run dev         # API on 3001 + Vite on 5173 with the /api proxy
```

Open http://127.0.0.1:5173. Vite proxies `/api` to Express at http://127.0.0.1:3001.

Configuration is optional for local work: copy `.env.example` to `.env` if needed. **Never commit `.env`.** The complete table — defaults, the AI key, and the dev-only demo switches — is in `docs/ENVIRONMENT.md`; the short version:

| Variable   | Default       | Purpose                                                  |
| ---------- | ------------- | -------------------------------------------------------- |
| `NODE_ENV` | `development` | `production` enables serving the built frontend          |
| `HOST`     | `127.0.0.1`   | Use `0.0.0.0` on a hosting service if required           |
| `PORT`     | `3001`        | Backend listening port; dev proxy currently targets 3001 |

Only `AI_API_KEY` and the demo password are secrets. Both stay server-side: the key is never sent to the browser and never appears in a prompt, and no secret is ever placed in a `VITE_*`/frontend variable. The AI key may simply be omitted.

## Checks

```sh
npm run check                     # lint (zero warnings) + tests + typecheck + build
node scripts/smoke.mjs            # production HTTP smoke (requires a build)
node scripts/verify-demo-accounts.mjs  # all four demo roles sign in
npm run ai:check                  # live AI provider check (needs AI_API_KEY)
```

`npm run check` is the full gate: ESLint with `--max-warnings 0`, the Vitest suite, all three TypeScript projects, and the client+server production build. Every "it works" claim in this README is backed by one of these checks or by the E2E scripts below — not by manual assertion alone.

## Production foundation

Run `npm ci`, `npm run build`, and `npm start` with `NODE_ENV=production` configured in the host environment. Express serves `dist/client` and `/api` on the same origin. A split frontend deployment must proxy `/api` to the backend; do not add permissive CORS as a shortcut. TLS is expected at the hosting reverse proxy (`COOKIE_SECURE=auto` then marks cookies Secure).

The production build is exercised locally by the smoke check and every E2E script above (each one runs the compiled server in production mode). No hosting deployment has been performed, and the SQLite choices that constrain one — a single instance and a persistent disk, with PostgreSQL as the documented migration path — are recorded in `docs/ENVIRONMENT.md`.

## Product scope

Learners are the primary users: register → browse → enter a fictional company → investigate → save decisions → handle changes → submit → reflect → share evidence. Mentors add human oversight; employers inspect consented work evidence; admins manage simulation content.

Two required scenarios:

- **NovaShop / Junior Frontend Developer:** investigate mobile checkout failures, propose a patch, respond to a guest-checkout clarification, and provide a test plan.
- **MarketFlow / Junior Data Analyst:** analyze a synthetic sales dataset, explain a decline with reproducible calculations, and recommend action with limitations.

Both scenarios are fully playable and shipped with bilingual materials (bug report, suspect component source, synthetic CSV dataset with a data dictionary, acceptance criteria) plus timed in-simulation events. The companies are fictional — no real employer integrations exist or are implied.

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

## Admin catalog (Phase 10)

The ADMIN role manages the simulation catalog from `/admin` (nav link appears
only for ADMIN accounts). All admin endpoints are gated server-side with
`requireAuth + requireRole('ADMIN')` — the UI link is cosmetic, not the gate.

What admins can do:

- **View** every simulation (including inactive ones hidden from learners), with task/material/attempt counts.
- **Create** new simulations with bilingual (EN/AR) fields; slug is validated and must be unique.
- **Edit** simulation details (title, company, role, summary, brief, duration, ordering).
- **Activate/deactivate** — deactivation hides the simulation from the public catalog immediately without touching data.
- **Manage tasks**: create and edit tasks, including the submission-form fields JSON and the deterministic rubric JSON. These are validated server-side with the same parsers the evaluation path uses (`parseTaskFields`, `parseRubric`), so a bad save is a 400 to the admin — never a 500 for learners later.
- **Manage materials**: full create/edit/delete (materials are unreferenced handouts).

Safety rules:

- **Simulations and tasks are never deleted through the API** — attempts and submissions reference them, and learner evidence must never be orphaned. Deactivation is the off switch.
- **Editing a task never rewrites history**: attempts snapshot the task at start (`taskSnapshotJson`), so edits affect only future attempts.
- Seeded simulations are republished from code on every `npm run db:seed`; a reseed overwrites database edits to seeded rows (the admin UI states this). The admin screen is for live fixes and new content.

API surface (all require ADMIN, unknown ids are 404, no existence leaks):

- `GET /api/admin/simulations`, `POST /api/admin/simulations`, `GET|PUT /api/admin/simulations/:id`, `PATCH /api/admin/simulations/:id/active`
- `POST /api/admin/simulations/:id/tasks`, `GET|PUT /api/admin/tasks/:taskId`
- `POST /api/admin/simulations/:id/materials`, `GET|PUT|DELETE /api/admin/materials/:materialId`

## Mobile workspace

The simulation workspace is the mobile-first screen (the task is the product). Below 900px the two columns become a `Work / Messages / Materials` tab strip so the learner never scrolls past a long form to reach the team's messages or the task materials; above 900px both columns are visible at once, from the same markup. Task materials are expandable in place — the bug report and acceptance criteria are the task's inputs — with prose wrapping and code scrolling internally, so nothing widens the page.

Verified in a real browser, not just in tests: `node scripts/e2e-mobile-workspace.mjs` starts the built app and drives Chrome at a 390x844 phone viewport through login → start → panes → materials → draft save → reload → Arabic, asserting no horizontal overflow on every pane in both directions, tappable (44px+) save/submit, and that a draft survives a reload. Evidence: `screenshots/09-mobile-workspace.png`. The check uses `playwright-core` against the browser already installed on the machine (`CHROME_PATH` to override), so no browser download is needed.

## AI boundaries

Two features ship, both server-side and advisory: a **submission reviewer** (strengths, gaps, recommendations, explanation for one submitted task) and a **skill coach** (cross-simulation development guidance from completed evidence). Both go through one small provider adapter (Gemini via its OpenAI-compatible endpoint), are validated by a zod schema, cached by evidence hash + locale + prompt version, and are hard-capped on output size and per-user request rate. `docs/AI.md` documents the prompts, the schema, the failure taxonomy and the cost bounds.

The design rules that matter:

- **The deterministic rubric is the score of record.** AI feedback has no numeric field at all and can never change a score; mentor feedback is human oversight and equally advisory.
- **AI is never used for** authentication, authorization, catalog CRUD, navigation, localization, search, validation, or objective calculation — deterministic software is cheaper, more predictable and auditable, and a score must be reproducible.
- **AI is optional.** With no `AI_API_KEY` every page still works and shows a neutral "feedback unavailable" state; a timeout, provider error, rate limit or malformed response is stored as `UNAVAILABLE` rather than shown as truth. Submissions are always saved before any provider call.
- **Viewing feedback never spends tokens.** Mentor and employer screens read stored, READY rows only and cannot trigger generation.
- **The platform never executes learner code.** Submitted patches are text proposals reviewed by rubric/AI/mentor — running them would be a remote-code-execution liability with no assessment benefit.

`npm run ai:check` exercises the real provider with a fixed input and prints the validated result — that is the honest live-provider evidence. The Vitest suite uses deterministic test doubles (labelled as such) and asserts the failure taxonomy; doubles are never counted as live verification.

## Screenshots

Ten screenshots of the **real running product** (production build, seeded demo data, driven through a real browser with `playwright-core`) live in `screenshots/`. They are produced by `node scripts/capture-screenshots.mjs`, which asserts that each page rendered the expected text direction and that no two images are byte-identical — a duplicate would mean a capture silently failed and would be dishonest to ship as evidence of a different screen. The per-file log is in `screenshots/README.md`.

| File | Audience | What it shows |
| --- | --- | --- |
| `01-home.png` | Visitors | realistic job practice and the evidence model |
| `02-catalog.png` | Learners | comparing the two simulations, filtering by skill |
| `03-novashop-details.png` | Learners | the frontend brief, requirements and materials |
| `04-novashop-workspace.png` | Learners | the buggy component source, the task form, the team inbox |
| `05-novashop-feedback.png` | Learners | deterministic evaluation plus the AI review |
| `06-marketflow-workspace.png` | Learners | the sales dataset materials and analysis fields |
| `07-mentor-review.png` | Mentors | submitted work, AI context, human feedback form |
| `08-employer-evidence.png` | Employers | a consenting candidate's work, evaluation and approach |
| `09-mobile-workspace.png` | Learners | the workspace at a 390x844 phone viewport (pane tabs) |
| `10-arabic-interface.png` | Arabic speakers | a core workflow in Arabic with RTL direction |

## Documentation

- `docs/ROADMAP.md` — phases, per-phase verified checkpoints, final acceptance checklist.
- `docs/ARCHITECTURE.md` — architecture decisions (ADRs) and the data/API boundaries.
- `docs/AI.md` — prompts, schemas and validation, caching, failure taxonomy, cost bounds, AI boundaries.
- `docs/ENVIRONMENT.md` — every environment variable, database location, deployment story and its limitations.
- `docs/OUT-OF-SCOPE.md` — deliberately absent features and mocked/demo-only behavior, each with the reason it stays out.
- `screenshots/README.md` — the screenshot capture log.

## End-to-end verification

Each script boots the compiled production server and drives it over HTTP (or a real browser), asserting behaviour rather than describing it:

```sh
node scripts/smoke.mjs                 # health, HTML, built asset, API 404
node scripts/e2e-admin.mjs             # admin authorization + catalog CRUD lifecycle
node scripts/e2e-employer.mjs          # consent-scoped employer evidence, IDOR attempts
node scripts/e2e-mentor-learner.mjs    # mentor queue → review → learner-visible feedback
node scripts/e2e-locale.mjs            # registered language preference after sign-in
node scripts/e2e-mobile-workspace.mjs  # real Chrome, 390x844, overflow + tap targets
node scripts/e2e-demo-assign.mjs       # dev-only auto-assign/auto-share behaviour
node scripts/e2e-demo-assign-guard.mjs # proves both switches are OFF in production
node scripts/verify-demo-accounts.mjs  # all four demo roles sign in
node scripts/capture-screenshots.mjs   # regenerates screenshots/ from the real app
```

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

## Demo walkthrough

A short script for reviewing the product (roughly 10 minutes). Every step maps to
a role and a requirement, and all data is real — nothing here is a mock screen.

1. **Learner, end to end** — sign in as `learner@worksim.dev`, open `/simulations`,
   compare the two scenarios (skill filter), then open **NovaShop** and read the
   brief, requirements and materials. Press **Start**, and in the workspace open
   the buggy-component source, answer the work fields, expand the team inbox, and
   save a draft. Reload the page: the draft survives. Submit.
2. **Deterministic evaluation** — the evidence page shows the score with a
   per-criterion breakdown: met, not met, and *excluded because the requirement
   arrived after you submitted*. That line is the dynamic-requirement change, and
   it is the score of record.
3. **AI reviewer** — on the same page, request AI feedback (or read the stored
   review). Point out that the score did not move and the AI has no numeric field.
4. **Mentor** — sign in as `mentor@worksim.dev`, open **Mentor reviews**, and open
   the seeded submission: the learner's full work product, the evaluation, the
   recorded timeline, and the learner's AI feedback read-only. Write feedback and
   **Complete review**.
5. **Back to the learner** — reload the evidence page as the learner: the **Mentor
   feedback** section now shows the mentor's name and text. Before step 4 it said
   *"Pending mentor review"*.
6. **Employer** — sign in as `employer@worksim.dev`, open **Candidate evidence**,
   and open the same submission: candidate, assignment context, submitted work,
   evaluation, skills, timeline, cached AI feedback and completed mentor feedback.
   There are no edit or generate controls anywhere — this surface is read-only.
7. **Admin** — sign in as `admin@worksim.dev`, open **Manage catalog**, edit a
   simulation and deactivate it; it disappears from the public catalog (`/simulations`)
   immediately. Reactivate it. Note the on-screen warning that reseeding restores
   code-authored simulations.
8. **Language and phone** — switch to **العربية** (the interface mirrors to RTL,
   including the evidence page), then narrow the window or use a phone viewport:
   the workspace collapses into `Work / Messages / Materials` panes.

Things to say honestly if asked: the AI feedback shown for the seeded submission is
a **cached** row stamped `seed:demo` (so the reviewer/employer screens are populated
without spending tokens) — a fresh submission generates real feedback via
`npm run ai:check`; no hosting deployment has been performed; and `npm audit` could
not produce a verdict in this environment because the registry retired the endpoint.
