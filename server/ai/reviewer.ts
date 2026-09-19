import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
import type { Locale } from '../locale.js';
import { buildEvidence, type SubmissionContext } from '../submissions/view.js';
import { loadEvidence } from '../submissions/service.js';
import type { AiProvider } from './provider.js';
import { parseAiJson } from './parse.js';
import { REVIEW_MAX_OUTPUT_CHARS, REVIEW_PROMPT_VERSION, reviewSchema, type ReviewFeedback } from './schemas.js';
export { type ReviewFeedback };
import { REVIEW_SYSTEM_PROMPT } from './prompts.js';

export interface StoredFeedback<T> {
  status: 'READY' | 'UNAVAILABLE';
  feedback: T | null;
  failureCode: string | null;
  model: string | null;
  completedAt: string | null;
}

function unavailable<T>(failureCode: string, prior?: { model?: string | null; completedAt?: Date | null }): StoredFeedback<T> {
  return { status: 'UNAVAILABLE', feedback: null, failureCode, model: prior?.model ?? null, completedAt: prior?.completedAt?.toISOString() ?? null };
}

function ready<T>(feedback: T, model: string, completedAt: Date): StoredFeedback<T> {
  return { status: 'READY', feedback, failureCode: null, model, completedAt: completedAt.toISOString() };
}

/** Canonical, deterministic serialization for the cache key. Identical evidence
 *  must produce identical input, or "cached" would mean something arbitrary. */
function inputHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Stored rows are written by this server (`JSON.stringify` of a validated
 *  object), so they only ever need a plain read — model output goes through
 *  the tolerant `parseAiJson` below. */
function readStoredJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The model sees the learner's own localized evidence view — simulation,
 *  frozen task, requirements with their deterministic results, delivered
 *  events, the submission itself and credited skills. Nothing else: no account
 *  data, no other users, no internal ids beyond rubric keys. */
function reviewerUserPrompt(submission: SubmissionContext, locale: Locale): string {
  const evidence = buildEvidence(submission, locale, true);
  const requirements = evidence.evaluation?.criteria.map((criterion) => `${criterion.label} [${criterion.met ? 'met' : criterion.skipped ? 'not applicable' : 'not met'}]`) ?? [];
  const work = evidence.work.map((field) => `--- ${field.label} ---\n${field.value || '(empty)'}`).join('\n\n');
  const events = evidence.timeline.map((entry) => `- [${entry.kind}] ${entry.title}: ${entry.body}`);
  const skills = evidence.skills.map((skill) => `- ${skill.name}: ${skill.basis}`);

  return `Language for your entire JSON answer: "${locale === 'AR' ? 'ar' : 'en'}".

SIMULATION: ${evidence.simulation.company} — ${evidence.simulation.roleTitle}
TASK: ${evidence.task.title}
INSTRUCTIONS GIVEN TO THE EMPLOYEE:
${evidence.task.instructions}

REQUIREMENTS (deterministic check + result — the only objective facts; you must not re-score them):
${requirements.map((line, index) => `${index + 1}. ${line}`).join('\n') || 'none'}

DELIVERED EVENTS DURING THE TASK (requirements or information the employee received while working):
${events.join('\n') || 'none'}

SKILLS CREDITED BY THE DETERMINISTIC SYSTEM (each was met by an objective check):
${skills.join('\n') || 'none'}

THE EMPLOYEE'S SUBMISSION:
${work}

Review this submission as a supervisor would. Follow the system rules: cite only what is above, do not score, do not do the work, say what is missing instead of assuming.`;
}

/** Reads the stored feedback for a submission+locale, or null when none exists
 *  yet. Used by evidence reads to enrich the response without calling the
 *  provider. */
export async function readStoredReview(submissionId: string, locale: Locale): Promise<StoredFeedback<ReviewFeedback> | null> {
  const row = await prisma.aIFeedback.findUnique({ where: { submissionId_locale: { submissionId, locale } } });
  if (!row || row.status === 'PENDING') return null;
  if (row.status === 'UNAVAILABLE') {
    return unavailable<ReviewFeedback>(row.failureCode ?? 'UNKNOWN', { model: row.model, completedAt: row.completedAt });
  }
  // A stored READY row whose JSON no longer parses degrades to unavailable:
  // reads must never crash because of legacy or corrupt data.
  const parsed = reviewSchema.safeParse(readStoredJson(row.feedbackJson ?? 'null'));
  if (!parsed.success) return unavailable<ReviewFeedback>('AI_INVALID_RESPONSE', { model: row.model, completedAt: row.completedAt });
  return ready(parsed.data, row.model ?? 'unknown', row.completedAt ?? row.requestedAt);
}

/** Generates (or retries after a failure) the AI review for one owned
 *  submission.
 *
 *  Caching rule: a READY row is returned as-is — regenerating on every read
 *  would spend tokens to produce different wording about an immutable
 *  submission. An UNAVAILABLE row is a retryable request. The provider is
 *  called at most once per explicit request; nothing calls it on page loads. */
export async function reviewSubmission(submissionId: string, userId: string, locale: Locale, provider: AiProvider): Promise<StoredFeedback<ReviewFeedback>> {
  const submission = await loadEvidence(submissionId);
  if (submission.attempt.user.id !== userId) {
    // Ownership check before anything else; indistinguishable from "does not
    // exist" so guessed ids leak nothing.
    throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'That submission does not exist.');
  }

  const cached = await prisma.aIFeedback.findUnique({ where: { submissionId_locale: { submissionId, locale } } });
  if (cached?.status === 'READY') {
    const stored = await readStoredReview(submissionId, locale);
    if (stored) return stored;
  }

  const userPrompt = reviewerUserPrompt(submission, locale);
  const hash = inputHash({ version: REVIEW_PROMPT_VERSION, system: REVIEW_SYSTEM_PROMPT, user: userPrompt });

  const row = cached
    ? await prisma.aIFeedback.update({ where: { id: cached.id }, data: { status: 'PENDING', inputHash: hash, failureCode: null } })
    : await prisma.aIFeedback.create({ data: { submissionId, locale, status: 'PENDING', inputHash: hash, promptVersion: REVIEW_PROMPT_VERSION } });

  try {
    const completion = await provider.complete(REVIEW_SYSTEM_PROMPT, userPrompt, REVIEW_MAX_OUTPUT_CHARS);
    // `parseAiJson` normalizes the model's markdown-fence habit before the
    // schema validates it. Nothing is trusted: an answer that still does not
    // match is recorded as unavailable, never stored as feedback.
    const parsed = reviewSchema.safeParse(parseAiJson(completion.content));
    if (!parsed.success) {
      await prisma.aIFeedback.update({
        where: { id: row.id },
        data: { status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE', model: completion.model },
      });
      return unavailable<ReviewFeedback>('AI_INVALID_RESPONSE', { model: completion.model });
    }
    const completedAt = new Date();
    await prisma.aIFeedback.update({
      where: { id: row.id },
      data: { status: 'READY', feedbackJson: JSON.stringify(parsed.data), failureCode: null, model: completion.model, promptVersion: REVIEW_PROMPT_VERSION, completedAt },
    });
    return ready(parsed.data, completion.model, completedAt);
  } catch (error) {
    // Provider failures (no key, timeout, rate limit, HTTP error) are recorded
    // per submission+locale so the UI can offer a retry. The submission,
    // evaluation and evidence are untouched — AI failure never blocks them.
    const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'AI_PROVIDER_ERROR';
    await prisma.aIFeedback.update({ where: { id: row.id }, data: { status: 'UNAVAILABLE', failureCode: code } }).catch(() => undefined);
    return unavailable<ReviewFeedback>(code);
  }
}
