import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
import { evaluateWork, parseRubric } from '../evaluation/rubric.js';
import type { SubmissionContext } from './view.js';

/** Shared include graph for work evidence. Every audience (learner, mentor,
 *  employer) reads through the same shape, so a new audience cannot accidentally
 *  see a different version of the same submission. */
export const submissionInclude = {
  evaluation: true,
  demonstratedSkills: { include: { skill: true } },
  attempt: {
    include: {
      user: { select: { id: true, name: true } },
      simulation: true,
      task: true,
      eventDeliveries: { include: { event: true }, orderBy: { deliveredAt: 'asc' } },
    },
  },
} as const;

/** The completed human review a learner sees on their own evidence. Only
 *  COMPLETED rows are ever returned: drafts are the mentor's private working
 *  copy and must stay invisible to the learner until the mentor finishes. */
export interface CompletedMentorFeedback {
  reviewerName: string;
  feedback: string;
  completedAt: string;
}

export async function loadCompletedMentorFeedback(submissionId: string): Promise<CompletedMentorFeedback | null> {
  const review = await prisma.mentorReview.findFirst({
    where: { submissionId, status: 'COMPLETED' },
    orderBy: { updatedAt: 'desc' },
    include: { mentor: { select: { name: true } } },
  });
  if (!review) return null;
  return {
    reviewerName: review.mentor.name,
    feedback: review.feedback,
    completedAt: review.updatedAt.toISOString(),
  };
}

export async function loadEvidence(submissionId: string): Promise<SubmissionContext> {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: submissionInclude });
  if (!submission) throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'That submission does not exist.');
  return submission;
}

/** Ownership-scoped load: the query itself enforces the rule, so a learner who
 *  guesses another learner's submission id gets a 404, not someone else's work. */
export async function loadOwnedSubmission(submissionId: string, userId: string): Promise<SubmissionContext> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, attempt: { userId } },
    include: submissionInclude,
  });
  if (!submission) throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'That submission does not exist.');
  return submission;
}

/** Minimal attempt shape needed to grade and persist a submission. The query
 *  results that feed this (the attempt route, the seed script) already include
 *  the task row, so the rubric is read from the frozen task content. */
export interface SubmissibleAttempt {
  id: string;
  simulationId: string;
  task: { id: string; checklistJson: string };
}

export interface RecordedSubmission {
  submissionId: string;
  score: number;
  maxScore: number;
}

/** Grades and persists a learner's submitted work for one attempt. The
 *  deterministic evaluation, skill crediting and attempt status flip live here
 *  so the learner route and the seed script grade submissions through one code
 *  path - a seeded demo submission is produced by the exact grader that scores
 *  real learner work. */
export async function recordSubmission(
  attempt: SubmissibleAttempt,
  work: Record<string, string>,
  deliveredEventKeys: ReadonlySet<string>,
): Promise<RecordedSubmission> {
  const rubric = parseRubric(attempt.task.checklistJson);
  const result = evaluateWork(rubric, work, deliveredEventKeys);
  const simulationSkills = await prisma.simulationSkill.findMany({
    where: { simulationId: attempt.simulationId },
    include: { skill: true },
  });
  const metByKey = new Map(result.criteria.map((criterion) => [criterion.key, criterion]));

  const submission = await prisma.$transaction(async (transaction) => {
    const created = await transaction.submission.create({ data: { attemptId: attempt.id, workJson: JSON.stringify(work) } });
    await transaction.evaluation.create({
      data: {
        submissionId: created.id,
        rubricVersion: result.rubricVersion,
        score: result.score,
        maxScore: result.maxScore,
        criteriaJson: JSON.stringify(result.criteria),
      },
    });
    // A skill is only claimed when its rubric criterion was actually met, and
    // the claim stores why. DemonstratedSkill is evidence, not a badge.
    for (const link of simulationSkills) {
      const criterion = link.checklistKey ? metByKey.get(link.checklistKey) : undefined;
      if (!criterion?.met) continue;
      await transaction.demonstratedSkill.create({
        data: {
          submissionId: created.id,
          skillId: link.skillId,
          basisJson: JSON.stringify({
            checklistKey: criterion.key,
            weight: criterion.weight,
            labelEn: criterion.labelEn,
            labelAr: criterion.labelAr,
            evidence: criterion.evidence,
          }),
        },
      });
    }
    await transaction.simulationAttempt.update({
      where: { id: attempt.id },
      data: { status: 'EVALUATED', submittedAt: new Date(), lastSavedAt: new Date() },
    });
    return created;
  });

  return { submissionId: submission.id, score: result.score, maxScore: result.maxScore };
}
