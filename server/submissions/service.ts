import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
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
