import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../http-error.js';
import type { Locale } from '../locale.js';
import { pick } from '../simulations/view.js';
import { submissionInclude } from '../submissions/service.js';
import { buildEvidence, type SubmissionContext, type SubmissionEvidence } from '../submissions/view.js';
import { readStoredReview, type ReviewFeedback, type StoredFeedback } from '../ai/reviewer.js';

/** The mentor feature. Scope rule: a mentor may only ever touch submissions
 *  whose attempt belongs to a learner assigned to them (`MentorAssignment`).
 *  The rule lives inside the queries below — the same "the query is the check"
 *  pattern as `loadOwnedSubmission` — so an out-of-scope id is a 404 that is
 *  indistinguishable from a missing one, and no post-filter can be forgotten.
 *
 *  The AI review shown here is the learner's own cached, read-only feedback
 *  (READY rows only). Mentors read it for context; nothing in this feature can
 *  spend provider tokens, and mentor feedback never mixes with the
 *  deterministic evaluation that owns the score. */

export const MENTOR_FEEDBACK_MAX_LENGTH = 4000;

const feedbackText = z
  .string({ invalid_type_error: 'Feedback must be text.' })
  .trim()
  .min(1, 'Feedback text is required.')
  .max(MENTOR_FEEDBACK_MAX_LENGTH, `Feedback must be at most ${MENTOR_FEEDBACK_MAX_LENGTH} characters.`);

export const draftReviewInputSchema = z.object({ feedback: feedbackText }).strict();
export const completeReviewInputSchema = z.object({ feedback: feedbackText.optional() }).strict();

/** Parse a request body against a mentor schema; anything else is a client
 *  mistake with a safe message (no zod internals leak to the client). */
export function parseMentorBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw validationError(parsed.error.issues[0]?.message ?? 'The request body is invalid.');
  }
  return parsed.data;
}

export interface MentorReviewView {
  feedback: string;
  status: 'DRAFT' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface MentorSubmissionDetail {
  evidence: SubmissionEvidence;
  /** This mentor's own review, or null before they have written one. Reviews
   *  are per (submission, mentor), so two mentors never see each other's text. */
  review: MentorReviewView | null;
  /** The learner's cached AI review for the requested locale — READY rows only;
   *  an absent or failed generation is simply "none", not an error surface. */
  aiReview: StoredFeedback<ReviewFeedback> | null;
}

export interface MentorQueueItem {
  id: string;
  submittedAt: string;
  learner: { id: string; name: string };
  simulation: { slug: string; company: string; roleTitle: string; title: string };
  taskTitle: string;
  score: { score: number; maxScore: number } | null;
  reviewStatus: 'NONE' | 'DRAFT' | 'COMPLETED';
  reviewUpdatedAt: string | null;
}

function toReviewView(review: { feedback: string; status: string; createdAt: Date; updatedAt: Date }): MentorReviewView {
  return {
    feedback: review.feedback,
    status: review.status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT',
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

/** The mentor's queue: every submitted work product from their assigned
 *  learners, newest first, with just enough detail to triage it. */
export async function listMentorSubmissions(mentorId: string, locale: Locale): Promise<MentorQueueItem[]> {
  const submissions = await prisma.submission.findMany({
    where: { attempt: { user: { assignedLearners: { some: { mentorId } } } } },
    orderBy: { submittedAt: 'desc' },
    include: {
      evaluation: true,
      mentorReviews: { where: { mentorId }, orderBy: { updatedAt: 'desc' }, take: 1 },
      attempt: {
        include: {
          user: { select: { id: true, name: true } },
          simulation: true,
          task: true,
        },
      },
    },
  });

  return submissions.map((submission) => {
    const review = submission.mentorReviews[0];
    return {
      id: submission.id,
      submittedAt: submission.submittedAt.toISOString(),
      learner: submission.attempt.user,
      simulation: {
        slug: submission.attempt.simulation.slug,
        company: submission.attempt.simulation.company,
        roleTitle: pick(locale, submission.attempt.simulation.roleTitleEn, submission.attempt.simulation.roleTitleAr),
        title: pick(locale, submission.attempt.simulation.titleEn, submission.attempt.simulation.titleAr),
      },
      taskTitle: pick(locale, submission.attempt.task.titleEn, submission.attempt.task.titleAr),
      score: submission.evaluation ? { score: submission.evaluation.score, maxScore: submission.evaluation.maxScore } : null,
      reviewStatus: review ? (review.status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT') : 'NONE',
      reviewUpdatedAt: review ? review.updatedAt.toISOString() : null,
    };
  });
}

interface ScopedSubmission extends SubmissionContext {
  mentorReviews: { feedback: string; status: string; createdAt: Date; updatedAt: Date }[];
}

/** Assignment-scoped load. Returns the full evidence context (the shared
 *  include graph) plus this mentor's own review row, if any. */
async function loadScopedSubmission(submissionId: string, mentorId: string): Promise<ScopedSubmission> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, attempt: { user: { assignedLearners: { some: { mentorId } } } } },
    include: { ...submissionInclude, mentorReviews: { where: { mentorId }, take: 1 } },
  });
  if (!submission) throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'That submission does not exist.');
  return submission as ScopedSubmission;
}

/** Full mentor view of one submission: the same evidence shape every audience
 *  sees, this mentor's review, and the learner's cached AI feedback. */
export async function getMentorSubmissionDetail(submissionId: string, mentorId: string, locale: Locale): Promise<MentorSubmissionDetail> {
  const submission = await loadScopedSubmission(submissionId, mentorId);
  const stored = await readStoredReview(submission.id, locale);
  const own = submission.mentorReviews[0];
  return {
    evidence: buildEvidence(submission, locale, true),
    review: own ? toReviewView(own) : null,
    aiReview: stored?.status === 'READY' ? stored : null,
  };
}

/** Upsert this mentor's review. `complete` finalizes it; otherwise the existing
 *  lifecycle status is preserved, so saving text can never silently demote a
 *  completed review back to a draft. */
export async function saveMentorReview(submissionId: string, mentorId: string, feedback: string, complete: boolean): Promise<MentorReviewView> {
  const submission = await loadScopedSubmission(submissionId, mentorId);
  const existing = await prisma.mentorReview.findUnique({
    where: { submissionId_mentorId: { submissionId: submission.id, mentorId } },
  });
  const status = complete || existing?.status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT';
  const review = existing
    ? await prisma.mentorReview.update({ where: { id: existing.id }, data: { feedback, status } })
    : await prisma.mentorReview.create({ data: { submissionId: submission.id, mentorId, feedback, status } });
  return toReviewView(review);
}

/** Completing without new text falls back to what is already saved; a review
 *  with no feedback text anywhere cannot be completed. */
export async function completeMentorReview(submissionId: string, mentorId: string, feedback?: string): Promise<MentorReviewView> {
  const submission = await loadScopedSubmission(submissionId, mentorId);
  const existing = await prisma.mentorReview.findUnique({
    where: { submissionId_mentorId: { submissionId: submission.id, mentorId } },
  });
  const text = feedback ?? existing?.feedback ?? '';
  if (text.trim().length === 0) {
    throw validationError('Feedback text is required to complete a review.');
  }
  return saveMentorReview(submissionId, mentorId, text, true);
}

