# AI design and boundaries

Status: implemented (Phase 5). Two features — Submission Reviewer and Career/Skill Coach — through one small provider adapter. This file documents what ships, not plans.

## What AI is for (and never for)

**Used for, exactly two things:**

1. **Submission Reviewer** — qualitative feedback on a submitted task (strengths, gaps, recommendations, explanation). Requested by the learner, readable by the mentor and (cached) by the employer as advisory context.
2. **Career/Skill Coach** — cross-simulation development guidance from a learner's completed evidence (strengths, improvement areas, next skills, next recommended simulation).

**Deliberately never used for:** authentication, authorization, catalog CRUD, navigation, localization, search, input validation, or the objective score. Deterministic software is cheaper, predictable and auditable; a rubric score must be reproducible and explainable, which a model output cannot be. The AI also never executes learner code (the platform never executes learner code at all).

The deterministic evaluation is the **score of record**. AI feedback is advisory: it cannot change any number anywhere. Mentor feedback is human oversight and equally advisory. This separation is enforced structurally — the review schema has **no numeric field at all** (see below).

## Provider adapter (server/ai/provider.ts)

- One interface, one real provider, one test double. A single `complete(system, user, maxOutputChars)` call is the whole abstraction — no agents, no streaming, no SDK.
- Real provider: **Gemini via its OpenAI-compatible Chat Completions endpoint** (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`), raw `fetch` with `AbortController` timeout (`AI_TIMEOUT_MS`).
- One error shape: `AiUnavailableError` with code `AI_NOT_CONFIGURED | AI_TIMEOUT | AI_PROVIDER_ERROR | AI_RATE_LIMITED | AI_INVALID_RESPONSE`. Callers handle exactly one failure type.
- No retries inside the provider; the feature layer decides fallback semantics (see failure behavior).

## Prompts (server/ai/prompts.ts)

Full text lives in code (the single source of truth); the ground rules and why:

| Rule | Why |
|---|---|
| Base every statement ONLY on the supplied context | The AI is an evidence reader, not an imagination. Prevents fabricated work/events/results. |
| Distinguish incorrect vs missing/unevidenced | The most common coaching error is inventing a gap. Forced explicitly. |
| Never assign a score or rating | Scores belong to the deterministic rubric; keeps advisory and objective separate. |
| Never write the deliverables (no finished patch/analysis) | The AI must not do the learner's task — the platform sells the learner's own work. |
| Check the mid-task events specifically | Requirement-change handling is an explicit assessment dimension. |
| Coach: `recommended_next_simulation` must be a supplied slug, verbatim | The model cannot invent simulations; the schema rejects anything else. |
| Output raw JSON only, arrays capped 1–6 × 500 chars, explanation ≤ 2000 chars | Bounded storage/UI; tolerant parser rejects fenced/garbage output. |
| Answer in the requested locale | Bilingual product; feedback is generated per locale and cached per locale. |

Only task data is interpolated; the system prompt is static and versioned (`REVIEW_PROMPT_VERSION` / `COACH_PROMPT_VERSION`) so stored feedback is traceable to the prompt that produced it.

## Validation and storage (server/ai/schemas.ts, parse.ts)

- Model output goes through `parseAiJson` (tolerant: strips accidental fences) then a **zod schema** (`reviewSchema` / `coachSchema`) with hard caps: arrays ≤ 6 items × ≤ 500 chars, prose ≤ 2000 chars. Anything else → `AI_INVALID_RESPONSE` → stored as UNAVAILABLE, never shown as truth.
- Output length to the provider is capped (`REVIEW_MAX_OUTPUT_CHARS` 4000, `COACH_MAX_OUTPUT_CHARS` 3000).
- Results are stored in `AIFeedback` / `CoachReport` with `status` (`PENDING|READY|UNAVAILABLE`), `model`, `failureCode`, `inputHash`, `promptVersion`.
- Submissions are stored **before** any provider call; an AI failure can never lose learner work.

## Caching and cost control

- **Cache key**: SHA-256 of the canonical evidence payload (`inputHash`) + `locale` + `promptVersion`. Same evidence + same prompt → cached read, no provider call. A prompt change or new evidence invalidates the cache naturally.
- **Reads are free**: mentor/employer/evidence views read stored READY rows only — viewing feedback never spends tokens, and those roles cannot trigger generation at all.
- **Generation is user-initiated and rate-limited** per user (`AI_RATE_LIMIT` window on the AI router; auth has its own limiter).
- **Input bounds**: the prompt carries the localized evidence view only (task, requirements, submission, delivered events, credited skills) — capped strings, no other users' data, no internal ids beyond rubric keys.
- **Cost failure modes**: missing key → platform fully functional with neutral "unavailable" states; timeout → abort + UNAVAILABLE row; provider error/rate limit → UNAVAILABLE row; malformed output → UNAVAILABLE row. Every failure is visible, explainable and recoverable (retry re-calls the provider).

## Live provider check

`npm run ai:check` (scripts/ai-check.ts) exercises the real provider with a small fixed input and prints the validated result — it is the honest "real provider" evidence; the Vitest suite uses deterministic test doubles only and asserts the failure taxonomy above. Test doubles are labeled as such in test comments and never counted as live verification.
