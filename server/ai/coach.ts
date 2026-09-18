import { prisma } from '../db.js';
import type { Locale } from '../locale.js';
import { pick } from '../simulations/view.js';
import type { AiProvider } from './provider.js';
import { parseAiJson } from './parse.js';
import { COACH_MAX_OUTPUT_CHARS, COACH_PROMPT_VERSION, coachSchema, type CoachFeedback } from './schemas.js';
import { COACH_SYSTEM_PROMPT } from './prompts.js';
import type { StoredFeedback } from './reviewer.js';

/** Minimum completed submissions before coaching means anything. With zero or
 *  one datapoint the model would be inventing trends, so the feature returns a
 *  meaningful "not yet" state instead of calling the provider. */
export const MIN_COMPLETED_FOR_COACHING = 2;

interface CoachEvidence {
  completedCount: number;
  submissions: {
    simulationTitle: string;
    score: string;
    skills: string[];
    reviewFeedback: { strengths: string[]; areas_to_improve: string[] } | null;
    mentorFeedback: string | null;
  }[];
  catalog: { slug: string; title: string; roleTitle: string; skills: string[]; completed: boolean }[];
  weakSkills: string[];
}

/** Assembles everything the coach may legitimately know: completed attempts
 *  with their deterministic results, credited skills, prior review feedback and
 *  any human mentor notes. In-progress attempts and other users' data never
 *  enter this payload. */
export async function gatherCoachEvidence(userId: string, locale: Locale): Promise<CoachEvidence> {
  const attempts = await prisma.simulationAttempt.findMany({
    where: { userId, status: { not: 'ACTIVE' } },
    orderBy: { submittedAt: 'desc' },
    include: {
      simulation: { include: { skills: { include: { skill: true } } } },
      task: true,
      submission: {
        include: {
          evaluation: true,
          demonstratedSkills: { include: { skill: true } },
          mentorReviews: true,
          aiFeedback: true,
        },
      },
    },
  });

  const submissions = [];
  const weakSkillIds = new Set<string>();
  for (const attempt of attempts) {
    const submission = attempt.submission;
    if (!submission) continue;
    const percent = submission.evaluation && submission.evaluation.maxScore > 0
      ? Math.round((submission.evaluation.score / submission.evaluation.maxScore) * 100)
      : null;
    const skills = submission.demonstratedSkills.map((entry) => pick(locale, entry.skill.nameEn, entry.skill.nameAr));
    // A rubric criterion the task required but the submission missed, mapped to
    // the simulation skill that criterion backs, is the honest definition of a
    // "weak evidenced area" on this platform.
    try {
      const criteria: { key: string; met: boolean; skipped: boolean }[] = JSON.parse(submission.evaluation?.criteriaJson ?? '[]');
      const unmetKeys = new Set(criteria.filter((criterion) => !criterion.met && !criterion.skipped).map((criterion) => criterion.key));
      for (const link of attempt.simulation.skills) {
        if (link.checklistKey && unmetKeys.has(link.checklistKey)) {
          weakSkillIds.add(pick(locale, link.skill.nameEn, link.skill.nameAr));
        }
      }
    } catch { /* criteria JSON is platform-written; corruption must not break coaching */ }
    const review = submission.aiFeedback.find((row) => row.locale === locale && row.status === 'READY');
    let reviewFeedback: { strengths: string[]; areas_to_improve: string[] } | null = null;
    if (review) {
      try {
        const parsed: unknown = JSON.parse(review.feedbackJson ?? 'null');
        if (parsed && typeof parsed === 'object' && 'strengths' in parsed && 'areas_to_improve' in parsed) {
          const shape = parsed as { strengths: unknown; areas_to_improve: unknown };
          if (Array.isArray(shape.strengths) && Array.isArray(shape.areas_to_improve)) {
            reviewFeedback = { strengths: shape.strengths.filter((s): s is string => typeof s === 'string').slice(0, 3), areas_to_improve: shape.areas_to_improve.filter((s): s is string => typeof s === 'string').slice(0, 3) };
          }
        }
      } catch { /* prior AI feedback is advisory; skip if unreadable */ }
    }
    submissions.push({
      simulationTitle: `${attempt.simulation.company} — ${pick(locale, attempt.simulation.titleEn, attempt.simulation.titleAr)}`,
      score: percent === null ? 'not scored' : `${percent}%`,
      skills,
      reviewFeedback,
      mentorFeedback: submission.mentorReviews.filter((entry) => entry.status === 'COMPLETED').map((entry) => entry.feedback.trim()).filter(Boolean).join(' ') || null,
    });
  }

  const completedCatalog = new Set(attempts.map((attempt) => attempt.simulation.slug));
  const catalog = (await prisma.simulation.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { skills: { include: { skill: true } } },
  })).map((simulation) => ({
    slug: simulation.slug,
    title: `${simulation.company} — ${pick(locale, simulation.titleEn, simulation.titleAr)}`,
    roleTitle: pick(locale, simulation.roleTitleEn, simulation.roleTitleAr),
    skills: simulation.skills.map((link) => pick(locale, link.skill.nameEn, link.skill.nameAr)),
    completed: completedCatalog.has(simulation.slug),
  }));

  const weakSkills = [...weakSkillIds].slice(0, 8);
  return { completedCount: submissions.length, submissions, catalog, weakSkills };
}

/** Cached coaching result for a user+locale, or null when none exists. */
export async function readStoredCoachReport(userId: string, locale: Locale): Promise<StoredFeedback<CoachFeedback> | null> {
  const row = await prisma.coachReport.findUnique({ where: { userId } });
  if (!row || row.locale !== locale || row.status === 'PENDING') return null;
  if (row.status === 'UNAVAILABLE') {
    return { status: 'UNAVAILABLE', feedback: null, failureCode: row.failureCode ?? 'UNKNOWN', model: row.model, completedAt: row.completedAt?.toISOString() ?? null };
  }
  try {
    const parsed = coachSchema.safeParse(JSON.parse(row.feedbackJson ?? 'null'));
    if (!parsed.success) {
      return { status: 'UNAVAILABLE', feedback: null, failureCode: 'AI_INVALID_RESPONSE', model: row.model, completedAt: row.completedAt?.toISOString() ?? null };
    }
    return { status: 'READY', feedback: parsed.data, failureCode: null, model: row.model, completedAt: row.completedAt?.toISOString() ?? null };
  } catch {
    return { status: 'UNAVAILABLE', feedback: null, failureCode: 'AI_INVALID_RESPONSE', model: row.model, completedAt: row.completedAt?.toISOString() ?? null };
  }
}

function coachUserPrompt(evidence: CoachEvidence, locale: Locale): string {
  const submissions = evidence.submissions.map((entry) => {
    const review = entry.reviewFeedback
      ? `\n  Prior AI review — strengths: ${entry.reviewFeedback.strengths.join('; ')} | to improve: ${entry.reviewFeedback.areas_to_improve.join('; ')}`
      : '';
    const mentor = entry.mentorFeedback ? `\n  Mentor feedback: ${entry.mentorFeedback}` : '';
    return `- ${entry.simulationTitle} — result: ${entry.score}\n  Credited skills: ${entry.skills.join(', ') || 'none'}${review}${mentor}`;
  }).join('\n');
  const catalog = evidence.catalog.map((entry) => `- ${entry.slug}: ${entry.title} (${entry.roleTitle}; skills: ${entry.skills.join(', ')})${entry.completed ? ' [already completed by the learner]' : ''}`).join('\n');

  return `Language for your entire JSON answer: "${locale === 'AR' ? 'ar' : 'en'}".

COMPLETED SIMULATIONS (${evidence.completedCount}):
${submissions || 'none'}

SKILL AREAS WHERE A REQUIRED RUBRIC CRITERION WAS NOT MET (evidence-backed gaps):
${evidence.weakSkills.join('; ') || 'none'}

AVAILABLE SIMULATIONS FOR RECOMMENDATION (use the slug verbatim in recommended_next_simulation):
${catalog}

Coach this learner's next steps. Follow the system rules: evidence only, no invented experience, absence of a skill means no evidence yet, and the recommended simulation must be one of the slugs above.`;
}

/** Generates or refreshes the coach report. Lifecycle: one report per user
 *  (`CoachReport.userId @unique`); it is regenerated only by an explicit
 *  request — never automatically on dashboard load. */
export async function coachLearner(userId: string, locale: Locale, provider: AiProvider): Promise<StoredFeedback<CoachFeedback> | { status: 'INSUFFICIENT_EVIDENCE'; completedCount: number }> {
  const evidence = await gatherCoachEvidence(userId, locale);
  if (evidence.completedCount < MIN_COMPLETED_FOR_COACHING) {
    return { status: 'INSUFFICIENT_EVIDENCE', completedCount: evidence.completedCount };
  }

  const userPrompt = coachUserPrompt(evidence, locale);
  const inputHash = Buffer.from(`${COACH_PROMPT_VERSION}:${userPrompt}`).toString('base64').slice(0, 64);
  const existing = await prisma.coachReport.findUnique({ where: { userId } });
  if (existing?.status === 'READY' && existing.inputHash === inputHash) {
    const cached = await readStoredCoachReport(userId, locale);
    if (cached) return cached;
  }

  const row = existing
    ? await prisma.coachReport.update({ where: { userId: existing.userId }, data: { locale, status: 'PENDING', inputHash, failureCode: null } })
    : await prisma.coachReport.create({ data: { userId, locale, status: 'PENDING', inputHash, promptVersion: COACH_PROMPT_VERSION } });

  try {
    const completion = await provider.complete(COACH_SYSTEM_PROMPT, userPrompt, COACH_MAX_OUTPUT_CHARS);
    const parsed = coachSchema.safeParse(parseAiJson(completion.content));
    const availableSlugs = new Set(evidence.catalog.map((entry) => entry.slug));
    if (!parsed.success || !availableSlugs.has(parsed.data.recommended_next_simulation)) {
      // Unknown slug or malformed JSON: the recommendation cannot be trusted,
      // so the report is stored as unavailable rather than showing a lie.
      await prisma.coachReport.update({ where: { userId: row.userId }, data: { status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE', model: completion.model } });
      return { status: 'UNAVAILABLE', feedback: null, failureCode: 'AI_INVALID_RESPONSE', model: completion.model, completedAt: null };
    }
    await prisma.coachReport.update({
      where: { userId: row.userId },
      data: { status: 'READY', feedbackJson: JSON.stringify(parsed.data), failureCode: null, model: completion.model, promptVersion: COACH_PROMPT_VERSION, completedAt: new Date() },
    });
    return { status: 'READY', feedback: parsed.data, failureCode: null, model: completion.model, completedAt: new Date().toISOString() };
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'AI_PROVIDER_ERROR';
    await prisma.coachReport.update({ where: { userId: row.userId }, data: { status: 'UNAVAILABLE', failureCode: code } }).catch(() => undefined);
    return { status: 'UNAVAILABLE', feedback: null, failureCode: code, model: null, completedAt: null };
  }
}
