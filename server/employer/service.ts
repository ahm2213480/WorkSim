import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
import type { Locale } from '../locale.js';
import { pick } from '../simulations/view.js';
import { submissionInclude } from '../submissions/service.js';
import { buildEvidence, type SubmissionContext, type SubmissionEvidence } from '../submissions/view.js';
import { readStoredReview, type ReviewFeedback, type StoredFeedback } from '../ai/reviewer.js';

/** The employer feature. Access rule: an employer may only ever see evidence of
 *  learners who granted them access (`EvidenceShare`, not revoked). Like mentor
 *  assignment scoping, the rule lives inside the queries — the same "the query
 *  is the check" pattern as `loadOwnedSubmission` — so a guessed or
 *  non-consented id is a 404 indistinguishable from a missing one, and no
 *  post-filter can be forgotten.
 *
 *  The feature is strictly read-only: there is no write endpoint anywhere in
 *  this module. The AI review shown is the learner's own cached, read-only
 *  feedback (READY rows only) — viewing evidence never spends provider tokens
 *  and never generates anything. Mentor feedback is shown once a mentor has
 *  completed their review; drafts are internal to the mentor workflow. */

export interface EmployerEvidenceItem {
  id: string;
  submittedAt: string;
  learner: { id: string; name: string };
  simulation: { slug: string; company: string; roleTitle: string; title: string };
  taskTitle: string;
  score: { score: number; maxScore: number } | null;
  skills: string[];
  /** Whether a mentor has completed a review. Draft state is a mentor-workflow
   *  detail and is deliberately not exposed to employers. */
  mentorReview: 'PENDING' | 'COMPLETED';
}

/** The employer's list: every completed submission from learners who shared
 *  their evidence with this employer, newest first, with just enough context to
 *  identify and pick a record. */
export async function listEmployerEvidence(employerId: string, locale: Locale): Promise<EmployerEvidenceItem[]> {
  const submissions = await prisma.submission.findMany({
    where: { attempt: { user: { evidenceGranted: { some: { employerId, revokedAt: null } } } } },
    orderBy: { submittedAt: 'desc' },
    include: {
      evaluation: { select: { score: true, maxScore: true } },
      demonstratedSkills: { include: { skill: { select: { nameEn: true, nameAr: true } } } },
      mentorReviews: { where: { status: 'COMPLETED' }, select: { id: true } },
      attempt: {
        include: {
          user: { select: { id: true, name: true } },
          simulation: true,
          task: { select: { titleEn: true, titleAr: true } },
        },
      },
    },
  });
  return submissions.map((submission) => ({
    id: submission.id,
    submittedAt: submission.submittedAt.toISOString(),
    learner: { id: submission.attempt.user.id, name: submission.attempt.user.name },
    simulation: {
      slug: submission.attempt.simulation.slug,
      company: submission.attempt.simulation.company,
      roleTitle: pick(locale, submission.attempt.simulation.roleTitleEn, submission.attempt.simulation.roleTitleAr),
      title: pick(locale, submission.attempt.simulation.titleEn, submission.attempt.simulation.titleAr),
    },
    taskTitle: pick(locale, submission.attempt.task.titleEn, submission.attempt.task.titleAr),
    score: submission.evaluation ? { score: submission.evaluation.score, maxScore: submission.evaluation.maxScore } : null,
    skills: submission.demonstratedSkills.map((entry) => pick(locale, entry.skill.nameEn, entry.skill.nameAr)),
    mentorReview: submission.mentorReviews.length > 0 ? 'COMPLETED' : 'PENDING',
  }));
}

interface SharedSubmission extends SubmissionContext {
  mentorReviews: { feedback: string; status: string; createdAt: Date; updatedAt: Date }[];
}

/** Consent-scoped load: the full shared evidence graph (the same include every
 *  audience reads through) plus the completed mentor review, if any. */
async function loadSharedSubmission(submissionId: string, employerId: string): Promise<SharedSubmission> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, attempt: { user: { evidenceGranted: { some: { employerId, revokedAt: null } } } } },
    include: {
      ...submissionInclude,
      mentorReviews: { where: { status: 'COMPLETED' }, orderBy: { updatedAt: 'desc' }, take: 1 },
    },
  });
  if (!submission) throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'That submission does not exist.');
  return submission as SharedSubmission;
}

export interface EmployerMentorFeedback {
  feedback: string;
  completedAt: string;
}

export interface EmployerEvidenceDetail {
  evidence: SubmissionEvidence;
  /** The most recent completed mentor review, or null when none is completed. */
  review: EmployerMentorFeedback | null;
  /** The learner's cached AI review for the requested locale — READY rows only;
   *  an absent or failed generation is simply "none", not an error surface. */
  aiReview: StoredFeedback<ReviewFeedback> | null;
}

/** Full employer view of one consented submission: the same evidence shape every
 *  audience sees, the completed mentor feedback, and the learner's cached AI
 *  feedback. Nothing here is writable and nothing here calls the provider. */
export async function getEmployerEvidenceDetail(submissionId: string, employerId: string, locale: Locale): Promise<EmployerEvidenceDetail> {
  const submission = await loadSharedSubmission(submissionId, employerId);
  const stored = await readStoredReview(submission.id, locale);
  const completed = submission.mentorReviews[0];
  return {
    evidence: buildEvidence(submission, locale, true),
    review: completed ? { feedback: completed.feedback, completedAt: completed.updatedAt.toISOString() } : null,
    aiReview: stored?.status === 'READY' ? stored : null,
  };
}
