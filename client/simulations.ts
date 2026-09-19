import { apiFetch } from './api';

/** Typed access to the learner-core endpoints. Payload types mirror the server
 *  builders (server/simulations/view.ts, server/attempts/routes.ts,
 *  server/submissions/view.ts); the locale is sent so the server resolves the
 *  bilingual columns once instead of shipping both languages to the browser. */

export interface SkillRef { slug: string; name: string }

export interface SimulationListItem {
  id: string;
  slug: string;
  company: string;
  roleTitle: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  skills: SkillRef[];
  taskCount: number;
  materialCount: number;
}

export interface SimulationDetail extends SimulationListItem {
  brief: string;
  materials: { id: string; kind: string; title: string; content: string }[];
  tasks: { id: string; order: number; title: string }[];
}

export interface TaskField {
  key: string;
  kind: 'text' | 'code';
  label: string;
  multiline: boolean;
  required: boolean;
}

export interface AttemptEvent {
  id: string;
  key: string;
  kind: string;
  fromName: string;
  fromRole: string | null;
  title: string;
  body: string;
  deliveredAt: string;
}

export interface AttemptPayload {
  id: string;
  status: 'ACTIVE' | 'SUBMITTED' | 'EVALUATED';
  createdAt: string;
  lastSavedAt: string | null;
  submittedAt: string | null;
  draft: Record<string, string>;
  simulation: { id: string; slug: string; company: string; roleTitle: string; title: string; estimatedMinutes: number };
  task: { id: string; title: string; instructions: string; fields: TaskField[] };
  events: AttemptEvent[];
  submissionId: string | null;
}

export interface AttemptSummary {
  id: string;
  status: string;
  simulation: { slug: string; company: string; title: string; roleTitle: string };
  taskTitle: string;
  startedAt: string;
  lastSavedAt: string | null;
  submittedAt: string | null;
  submissionId: string | null;
  score: { score: number; maxScore: number } | null;
  skills: string[];
}

export interface Evidence {
  id: string;
  submittedAt: string;
  learner: { id: string; name: string };
  simulation: { slug: string; company: string; roleTitle: string; title: string };
  task: { id: string; title: string; instructions: string };
  work: { key: string; label: string; kind: string; value: string }[];
  evaluation: {
    score: number;
    maxScore: number;
    percent: number;
    rubricVersion: string;
    criteria: { key: string; label: string; met: boolean; skipped: boolean; weight: number; evidence: string }[];
  } | null;
  skills: { slug: string; name: string; basis: string }[];
  timeline: { key: string; kind: string; title: string; body: string; deliveredAt: string; minutesAfterStart: number }[];
  status: string;
  startedAt: string;
}

export interface ReviewFeedback {
  strengths: string[];
  areas_to_improve: string[];
  actionable_recommendations: string[];
  explanation: string;
}

export interface CoachFeedback {
  demonstrated_strengths: string[];
  skills_to_improve: string[];
  recommended_next_skills: string[];
  recommended_next_simulation: string;
  reasoning: string;
}

export interface StoredAiFeedback<T> {
  status: 'READY' | 'UNAVAILABLE';
  feedback: T | null;
  failureCode: string | null;
  model: string | null;
  completedAt: string | null;
}

export type CoachResult =
  | { status: 'READY' | 'UNAVAILABLE'; feedback: CoachFeedback | null; failureCode: string | null; model: string | null; completedAt: string | null }
  | { status: 'INSUFFICIENT_EVIDENCE'; completedCount: number };

function withLocale(path: string, locale: string) {
  return `${path}${path.includes('?') ? '&' : '?'}locale=${locale.toUpperCase()}`;
}

export function listSimulations(locale: string) {
  return apiFetch<{ simulations: SimulationListItem[] }>(withLocale('/api/simulations', locale));
}

export function getSimulation(slug: string, locale: string) {
  return apiFetch<{ simulation: SimulationDetail }>(withLocale(`/api/simulations/${encodeURIComponent(slug)}`, locale));
}

export function startSimulation(slug: string) {
  return apiFetch<{ attemptId: string }>(`/api/simulations/${encodeURIComponent(slug)}/start`, { method: 'POST' });
}

export function listAttempts(locale: string) {
  return apiFetch<{ attempts: AttemptSummary[] }>(withLocale('/api/attempts', locale));
}

export function getAttempt(attemptId: string, locale: string) {
  return apiFetch<{ attempt: AttemptPayload }>(withLocale(`/api/attempts/${encodeURIComponent(attemptId)}`, locale));
}

export function saveDraft(attemptId: string, draft: Record<string, string>) {
  return apiFetch<{ savedAt: string }>(`/api/attempts/${encodeURIComponent(attemptId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ draft }),
  });
}

export function submitAttempt(attemptId: string, work: Record<string, string>, locale: string) {
  return apiFetch<{ submissionId: string; evidence: Evidence }>(withLocale(`/api/attempts/${encodeURIComponent(attemptId)}/submit`, locale), {
    method: 'POST',
    body: JSON.stringify({ work }),
  });
}

export function getSubmission(submissionId: string, locale: string) {
  return apiFetch<{ evidence: Evidence }>(withLocale(`/api/submissions/${encodeURIComponent(submissionId)}`, locale));
}

// ---- AI features (advisory feedback; the server validates and caches) ------

export function readReview(submissionId: string, locale: string) {
  return apiFetch<{ review: StoredAiFeedback<ReviewFeedback> | null }>(withLocale(`/api/submissions/${encodeURIComponent(submissionId)}/ai-review`, locale));
}

export function generateReview(submissionId: string, locale: string) {
  return apiFetch<{ review: StoredAiFeedback<ReviewFeedback> }>(withLocale(`/api/submissions/${encodeURIComponent(submissionId)}/ai-review`, locale), { method: 'POST' });
}

export function readCoachReport(locale: string) {
  return apiFetch<{ report: CoachResult | null }>(withLocale('/api/coach', locale));
}

export function generateCoachReport(locale: string) {
  return apiFetch<{ report: CoachResult }>(withLocale('/api/coach/generate', locale), { method: 'POST' });
}