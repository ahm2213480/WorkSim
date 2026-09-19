# Out of scope / intentionally absent features

This file lists what the platform deliberately does **not** implement, and why. Nothing here is "planned soon" — if it were planned, it would not be in this list. The point is honesty: the product must not imply features it does not have.

| Feature | Status | Why it stays out |
| --- | --- | --- |
| Email delivery (verification, notifications) | Not implemented | No mail provider in scope; the platform is fully usable without it. Would add a dependency + deliverability concerns for zero assessment value. |
| Password reset / recovery | Not implemented | Requires email (above) plus account-recovery security design. Passwords are scrypt-hashed; recovery without email would weaken the model. |
| Payments / subscriptions | Never | The assessment is about work evidence, not monetization. |
| Chat / messaging between users | Not implemented | The in-simulation inbox is **scripted simulation content** (timed events authored with the scenario), not user-to-user messaging. A real chat system is a different product. |
| Recruitment CRM (job postings, pipelines, interview scheduling) | Never | Explicitly out of scope by the assessment; the employer surface is read-only evidence review, not hiring workflow. |
| Candidate ranking / public profiles / social features | Never | Consent-based private evidence only. Public candidate search would violate the consent model (`EvidenceShare`). |
| File uploads | Not implemented | Materials are authored (bilingual text/code/CSV in the catalog). Uploads would require size/type/storage validation and abuse controls; text submission covers the tasks. |
| Arbitrary learner code execution | **Never by design** | Submitted `patch` fields are text proposals, reviewed by rubric/AI/mentor. Running learner code is a remote-code-execution liability with no assessment benefit. |
| Multi-task simulations | Not implemented | The schema keeps tasks separate from simulations precisely so this can grow later, but every shipped scenario is a single assignment — matching the assessment. |
| Autonomous AI agent / auto-complete work | **Never by design** | AI reviews and coaches; prompts and schemas forbid producing deliverables. The product sells the learner's own evidence. |
| Translation file system (i18n runtime) | Not needed | Two locales with parallel EN/AR columns and a typed dictionary beat a generic translation table at this scale (documented ADR). |
| Real company integrations | Never | NovaShop and MarketFlow are fictional. Nothing implies employer integrations. |
| Real-time updates (WebSocket/SSE) | Not implemented | The workspace polls while the attempt is active; the poll also drives clock-based event delivery on the server. Simple, explainable, sufficient. |
| Background workers / cron | Not implemented | Event delivery is derived from the clock on read (`deliverDueEvents`), so no worker is needed; a failed delivery recovers on the next request. |

## Mocked/demo-only behavior (clearly labeled, never in production)

- **Seeded demo accounts** (`*@worksim.dev`) with a shared password from `SEED_DEMO_PASSWORD` — for the assessment walkthrough; rotate/remove before any real deployment.
- **Seeded demo submission** with a **cached AI review stamped `model: "seed:demo"`** — so mentor/employer screens are populated without a provider key. It is a stored READY row like any other; nothing treats it as a live generation.
- **Dev-only auto-assign / auto-share** (`DEMO_AUTO_ASSIGN_MENTOR`, `DEMO_AUTO_SHARE_EVIDENCE`) — walkthrough conveniences resolving to development only; `scripts/e2e-demo-assign-guard.mjs` proves both are OFF in production mode.
- **Test doubles for the AI provider** in the Vitest suite — deterministic, labeled as doubles in comments, and never counted as live-provider verification (that is `npm run ai:check`).
