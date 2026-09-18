import { Router, type Request } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { parseTaskFields, parseRubric, evaluateWork } from '../evaluation/rubric.js';
import { HttpError } from '../http-error.js';
import { resolveLocale } from '../locale.js';
import { pick } from '../simulations/view.js';
import { buildEvidence } from '../submissions/view.js';
import { loadEvidence } from '../submissions/service.js';
import { MAX_FIELD_LENGTH, deliverDueEvents, parseSnapshot, parseWork } from './service.js';

/** Attempt endpoints: read the workspace, save a draft, and see the learner's
 *  own finished work.
 *
 *  Every handler re-scopes the query by `userId` instead of checking ownership
 *  separately, so one learner can never read another learner's work product
 *  even if they guess an attempt id. */
export function attemptsRouter() {
  const router = Router();
  router.use(requireAuth);

  async function loadOwnAttempt(req: Request) {
    const attempt = await prisma.simulationAttempt.findFirst({
      where: { id: attemptIdFrom(req), userId: req.user!.id },
      include: {
        simulation: true,
        task: true,
        eventDeliveries: { include: { event: true }, orderBy: { deliveredAt: 'asc' } },
        submission: { include: { evaluation: true, demonstratedSkills: { include: { skill: true } } } },
      },
    });
    if (!attempt) throw new HttpError(404, 'ATTEMPT_NOT_FOUND', 'That attempt does not exist.');
    return attempt;
  }

  router.get('/:id', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    await deliverDueEvents(attemptIdFrom(req)).catch((error: unknown) => {
      // Delivery is derived from the clock, so a failure here is recoverable on
      // the next request; it must not hide the learner's saved work.
      if (!(error instanceof HttpError && error.code === 'ATTEMPT_NOT_FOUND')) throw error;
    });
    const attempt = await loadOwnAttempt(req);
    const snapshot = parseSnapshot(attempt.taskSnapshotJson);
    const fields = snapshot?.fields ?? parseTaskFields(attempt.task.fieldsJson);
    res.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        createdAt: attempt.createdAt.toISOString(),
        lastSavedAt: attempt.lastSavedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        draft: safeParseObject(attempt.draftJson),
        simulation: {
          id: attempt.simulation.id,
          slug: attempt.simulation.slug,
          company: attempt.simulation.company,
          roleTitle: pick(locale, attempt.simulation.roleTitleEn, attempt.simulation.roleTitleAr),
          title: pick(locale, attempt.simulation.titleEn, attempt.simulation.titleAr),
          estimatedMinutes: attempt.simulation.estimatedMinutes,
        },
        task: {
          id: attempt.task.id,
          title: pick(locale, attempt.task.titleEn, attempt.task.titleAr),
          instructions: pick(locale, attempt.task.instructionsEn, attempt.task.instructionsAr),
          fields: fields.map((field) => ({
            key: field.key,
            kind: field.kind,
            label: pick(locale, field.labelEn, field.labelAr),
            multiline: field.multiline,
            required: field.required,
          })),
        },
        events: attempt.eventDeliveries.map((delivery) => ({
          id: delivery.event.id,
          key: delivery.event.key,
          kind: delivery.event.kind,
          fromName: delivery.event.fromName,
          fromRole: delivery.event.fromRole,
          title: pick(locale, delivery.event.titleEn, delivery.event.titleAr),
          body: pick(locale, delivery.event.bodyEn, delivery.event.bodyAr),
          deliveredAt: delivery.deliveredAt.toISOString(),
        })),
        submissionId: attempt.submission?.id ?? null,
      },
    });
  });

  // Learner dashboard data: every attempt this user owns, with the summary
  // needed to resume or review it. Scoped by userId, never by client input.
  router.get('/', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    const attempts = await prisma.simulationAttempt.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { simulation: true, task: true, submission: { include: { evaluation: true, demonstratedSkills: { include: { skill: true } } } } },
    });
    res.json({
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        simulation: {
          slug: attempt.simulation.slug,
          company: attempt.simulation.company,
          title: pick(locale, attempt.simulation.titleEn, attempt.simulation.titleAr),
          roleTitle: pick(locale, attempt.simulation.roleTitleEn, attempt.simulation.roleTitleAr),
        },
        taskTitle: pick(locale, attempt.task.titleEn, attempt.task.titleAr),
        startedAt: attempt.createdAt.toISOString(),
        lastSavedAt: attempt.lastSavedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        submissionId: attempt.submission?.id ?? null,
        score: attempt.submission?.evaluation
          ? { score: attempt.submission.evaluation.score, maxScore: attempt.submission.evaluation.maxScore }
          : null,
        skills: (attempt.submission?.demonstratedSkills ?? []).map((entry) => pick(locale, entry.skill.nameEn, entry.skill.nameAr)),
      })),
    });
  });

  // Draft saving. The server stores what the task's own field list allows and
  // nothing else, so a modified client cannot grow a draft into arbitrary data.
  router.patch('/:id', async (req, res) => {
    const attempt = await loadOwnAttempt(req);
    if (attempt.status !== 'ACTIVE') {
      throw new HttpError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'This attempt has already been submitted.');
    }
    const snapshot = parseSnapshot(attempt.taskSnapshotJson);
    const fields = snapshot?.fields ?? parseTaskFields(attempt.task.fieldsJson);
    const draft = sanitizeDraft(req.body?.draft, fields.map((field) => field.key));
    await prisma.simulationAttempt.update({ where: { id: attempt.id }, data: { draftJson: JSON.stringify(draft), lastSavedAt: new Date() } });
    res.json({ savedAt: new Date().toISOString() });
  });

  router.post('/:id/submit', async (req, res) => {
    const attempt = await loadOwnAttempt(req);
    if (attempt.status !== 'ACTIVE') {
      throw new HttpError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'This attempt has already been submitted.');
    }
    const snapshot = parseSnapshot(attempt.taskSnapshotJson);
    const fields = snapshot?.fields ?? parseTaskFields(attempt.task.fieldsJson);
    const work = parseWork(req.body?.work, fields);
    const rubric = parseRubric(attempt.task.checklistJson);
    // Submitting also touches the attempt, so events whose trigger time has
    // passed are delivered first. Without this, a learner who never refreshed
    // the workspace could be scored on a requirement that had already reached
    // them by the clock, and the evidence timeline would be incomplete.
    await deliverDueEvents(attempt.id);
    // `requiresEvent` is authored as the stable seed key, so delivered events
    // are matched by key rather than by database id.
    const deliveries = await prisma.attemptEvent.findMany({ where: { attemptId: attempt.id }, include: { event: true } });
    const deliveredKeys = new Set(deliveries.map((delivery) => delivery.event.key));
    const result = evaluateWork(rubric, work, deliveredKeys);
    const simulationSkills = await prisma.simulationSkill.findMany({
      where: { simulationId: attempt.simulationId },
      include: { skill: true },
    });
    const metByKey = new Map(result.criteria.map((criterion) => [criterion.key, criterion]));

    const submission = await prisma.$transaction(async (transaction) => {
      const created = await transaction.submission.create({
        data: { attemptId: attempt.id, workJson: JSON.stringify(work) },
      });
      await transaction.evaluation.create({
        data: {
          submissionId: created.id,
          rubricVersion: result.rubricVersion,
          score: result.score,
          maxScore: result.maxScore,
          criteriaJson: JSON.stringify(result.criteria),
        },
      });
      // A skill is only claimed when its rubric criterion was actually met,
      // and the claim stores why. DemonstratedSkill is evidence, not a badge.
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

    const locale = resolveLocale(req.query.locale);
    const evidence = await loadEvidence(submission.id);
    res.status(201).json({ submissionId: submission.id, evidence: buildEvidence(evidence, locale, true) });
  });

  return router;
}

/** Express 5 types route params as `string | string[] | undefined`. Prisma's
 *  argument inference silently degrades when a `where` value is not a plain
 *  string, so the id is narrowed once here and every query uses the result. */
function attemptIdFrom(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Accepts only known field keys with string values, trimmed and capped. An
 *  empty value is kept (it means "cleared"), so drafts round-trip faithfully. */
function sanitizeDraft(input: unknown, allowedKeys: string[]): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const draft: Record<string, string> = {};
  for (const key of allowedKeys) {
    const raw = source[key];
    if (typeof raw !== 'string') continue;
    draft[key] = raw.slice(0, MAX_FIELD_LENGTH);
  }
  return draft;
}

/** Drafts are server-owned blobs, but they are still parsed defensively: a
 *  corrupt row must degrade to an empty draft instead of a 500 for the learner. */
function safeParseObject(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
