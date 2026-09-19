import { apiFetch } from './api';
import type { Evidence, ReviewFeedback, StoredAiFeedback } from './simulations';

/** Typed access to the employer evidence endpoints (server/employer). The
 *  employer reads the same evidence shape as the learner and mentor
 *  (`Evidence`), plus the completed mentor feedback and the learner's cached AI
 *  feedback — both read-only, never generated from here. */

export interface EmployerEvidenceItem {
  id: string;
  submittedAt: string;
  learner: { id: string; name: string };
  simulation: { slug: string; company: string; roleTitle: string; title: string };
  taskTitle: string;
  score: { score: number; maxScore: number } | null;
  skills: string[];
  mentorReview: 'PENDING' | 'COMPLETED';
}

export interface EmployerMentorFeedback {
  feedback: string;
  completedAt: string;
}

export interface EmployerEvidenceDetail {
  evidence: Evidence;
  review: EmployerMentorFeedback | null;
  aiReview: StoredAiFeedback<ReviewFeedback> | null;
}

function withLocale(path: string, locale: string) {
  return `${path}${path.includes('?') ? '&' : '?'}locale=${locale.toUpperCase()}`;
}

export function listEmployerEvidence(locale: string) {
  return apiFetch<{ submissions: EmployerEvidenceItem[] }>(withLocale('/api/employer/evidence', locale));
}

export function getEmployerEvidence(submissionId: string, locale: string) {
  return apiFetch<EmployerEvidenceDetail>(withLocale(`/api/employer/evidence/${encodeURIComponent(submissionId)}`, locale));
}
