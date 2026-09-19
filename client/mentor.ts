import { apiFetch } from './api';
import type { Evidence, ReviewFeedback, StoredAiFeedback } from './simulations';

/** Typed access to the mentor review endpoints (server/mentor). The mentor sees
 *  the same evidence shape as the learner (`Evidence`), plus their own review
 *  and the learner's cached AI feedback — read-only, generated never. */

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

export interface MentorReviewState {
  feedback: string;
  status: 'DRAFT' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface MentorSubmissionDetail {
  evidence: Evidence;
  review: MentorReviewState | null;
  aiReview: StoredAiFeedback<ReviewFeedback> | null;
}

function withLocale(path: string, locale: string) {
  return `${path}${path.includes('?') ? '&' : '?'}locale=${locale.toUpperCase()}`;
}

export function listMentorSubmissions(locale: string) {
  return apiFetch<{ submissions: MentorQueueItem[] }>(withLocale('/api/mentor/submissions', locale));
}

export function getMentorSubmission(submissionId: string, locale: string) {
  return apiFetch<MentorSubmissionDetail>(withLocale(`/api/mentor/submissions/${encodeURIComponent(submissionId)}`, locale));
}

export function saveMentorDraft(submissionId: string, feedback: string) {
  return apiFetch<{ review: MentorReviewState }>(`/api/mentor/submissions/${encodeURIComponent(submissionId)}/review`, {
    method: 'PUT',
    body: JSON.stringify({ feedback }),
  });
}

export function completeMentorReview(submissionId: string, feedback?: string) {
  return apiFetch<{ review: MentorReviewState }>(`/api/mentor/submissions/${encodeURIComponent(submissionId)}/review/complete`, {
    method: 'POST',
    body: JSON.stringify(feedback === undefined ? {} : { feedback }),
  });
}
