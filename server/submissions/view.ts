import { parseJsonObject, parseSnapshot } from '../attempts/service.js';
import type { EvaluatedCriterion } from '../evaluation/rubric.js';
import type { Locale } from '../locale.js';
import { pick } from '../simulations/view.js';

/** One builder for the work-evidence payload, reused by the learner's own view,
 *  the mentor queue and the employer evidence page. Keeping a single shape means
 *  all three audiences see the same facts, and the only differences are which
 *  fields the route is allowed to expose. */

export interface SubmissionContext {
  id: string;
  submittedAt: Date;
  workJson: string;
  evaluation: { score: number; maxScore: number; criteriaJson: string; rubricVersion: string } | null;
  attempt: {
    status: string;
    createdAt: Date;
    taskSnapshotJson: string;
    user: { id: string; name: string };
    simulation: { slug: string; company: string; roleTitleEn: string; roleTitleAr: string; titleEn: string; titleAr: string };
    task: { id: string; titleEn: string; titleAr: string };
    eventDeliveries: {
      deliveredAt: Date;
      event: { key: string; kind: string; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string };
    }[];
  };
  demonstratedSkills: { skill: { slug: string; nameEn: string; nameAr: string }; basisJson: string }[];
}

export interface SubmissionEvidence {
  id: string;
  submittedAt: string;
  learner: { id: string; name: string };
  simulation: { slug: string; company: string; roleTitle: string; title: string };
  task: { id: string; title: string; instructions: string };
  /** The learner's answers, labelled with the field names from the frozen brief. */
  work: { key: string; label: string; kind: string; value: string }[];
  evaluation: {
    score: number;
    maxScore: number;
    percent: number;
    rubricVersion: string;
    criteria: { key: string; label: string; met: boolean; skipped: boolean; skipReason?: string; weight: number; evidence: string }[];
  } | null;
  skills: { slug: string; name: string; basis: string }[];
  /** Timeline of what the learner received while working. This is the part of
   *  evidence that shows how someone handled a change, not just the final file. */
  timeline: { key: string; kind: string; title: string; body: string; deliveredAt: string; minutesAfterStart: number }[];
  status: string;
  startedAt: string;
}

function parseCriteria(json: string): EvaluatedCriterion[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as EvaluatedCriterion[]) : [];
  } catch {
    return [];
  }
}

/** Skill basis is stored as JSON so the claim can carry its own explanation.
 *  It is summarized here in the requested language for display. */
function basisSummary(basisJson: string, locale: Locale): string {
  const basis = parseJsonObject(basisJson);
  const evidence = typeof basis.evidence === 'string' ? basis.evidence : '';
  const label = locale === 'AR' ? (basis.labelAr ?? basis.labelEn) : (basis.labelEn ?? basis.labelAr);
  if (typeof label !== 'string') return '';
  return evidence ? `${label} — ${evidence}` : label;
}

export function buildEvidence(submission: SubmissionContext, locale: Locale, includeTimeline: boolean): SubmissionEvidence {
  const snapshot = parseSnapshot(submission.attempt.taskSnapshotJson);
  const work = parseJsonObject(submission.workJson);
  const criteria = submission.evaluation ? parseCriteria(submission.evaluation.criteriaJson) : [];
  const startedAt = submission.attempt.createdAt.getTime();

  return {
    id: submission.id,
    submittedAt: submission.submittedAt.toISOString(),
    learner: { id: submission.attempt.user.id, name: submission.attempt.user.name },
    simulation: {
      slug: submission.attempt.simulation.slug,
      company: submission.attempt.simulation.company,
      roleTitle: pick(locale, submission.attempt.simulation.roleTitleEn, submission.attempt.simulation.roleTitleAr),
      title: pick(locale, submission.attempt.simulation.titleEn, submission.attempt.simulation.titleAr),
    },
    task: {
      id: submission.attempt.task.id,
      // Titles and instructions come from the frozen snapshot when available,
      // so evidence describes the task as it was given, not as it is today.
      title: snapshot ? pick(locale, snapshot.titleEn, snapshot.titleAr) : pick(locale, submission.attempt.task.titleEn, submission.attempt.task.titleAr),
      instructions: snapshot ? pick(locale, snapshot.instructionsEn, snapshot.instructionsAr) : '',
    },
    work: (snapshot?.fields ?? []).map((field) => ({
      key: field.key,
      label: pick(locale, field.labelEn, field.labelAr),
      kind: field.kind,
      value: typeof work[field.key] === 'string' ? (work[field.key] as string) : '',
    })),
    evaluation: submission.evaluation
      ? {
          score: submission.evaluation.score,
          maxScore: submission.evaluation.maxScore,
          percent: submission.evaluation.maxScore > 0 ? Math.round((submission.evaluation.score / submission.evaluation.maxScore) * 100) : 0,
          rubricVersion: submission.evaluation.rubricVersion,
          criteria: criteria.map((criterion) => ({
            key: criterion.key,
            label: pick(locale, criterion.labelEn, criterion.labelAr),
            met: criterion.met,
            skipped: criterion.skipped,
            // Present only for skipped criteria (e.g. an event-gated criterion
            // whose event never reached the learner). Explainability of the
            // score is part of the evidence contract.
            ...(criterion.skipReason ? { skipReason: criterion.skipReason } : {}),
            weight: criterion.weight,
            evidence: criterion.evidence,
          })),
        }
      : null,
    skills: submission.demonstratedSkills.map((entry) => ({
      slug: entry.skill.slug,
      name: pick(locale, entry.skill.nameEn, entry.skill.nameAr),
      basis: basisSummary(entry.basisJson, locale),
    })),
    timeline: includeTimeline
      ? submission.attempt.eventDeliveries
          .map((delivery) => ({
            key: delivery.event.key,
            kind: delivery.event.kind,
            title: pick(locale, delivery.event.titleEn, delivery.event.titleAr),
            body: pick(locale, delivery.event.bodyEn, delivery.event.bodyAr),
            deliveredAt: delivery.deliveredAt.toISOString(),
            minutesAfterStart: Math.max(0, Math.round((delivery.deliveredAt.getTime() - startedAt) / 60_000)),
          }))
          .sort((first, second) => first.minutesAfterStart - second.minutesAfterStart)
      : [],
    status: submission.attempt.status,
    startedAt: submission.attempt.createdAt.toISOString(),
  };
}
