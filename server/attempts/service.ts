import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
import { parseTaskFields, type TaskFieldDef } from '../evaluation/rubric.js';

/** Upper bound per submission field. The API body limit is 64kb, and this keeps
 *  a single field from consuming all of it while staying far above what a real
 *  answer needs (the longest expected answer is a code patch). */
export const MAX_FIELD_LENGTH = 20000;

/** The brief frozen at attempt start. Evidence reads this, not the live task
 *  row, so later catalog edits cannot rewrite what the learner was asked. */
export interface TaskSnapshot {
  taskId: string;
  titleEn: string;
  titleAr: string;
  instructionsEn: string;
  instructionsAr: string;
  fields: TaskFieldDef[];
  capturedAt: string;
}

export function buildTaskSnapshot(task: {
  id: string;
  titleEn: string;
  titleAr: string;
  instructionsEn: string;
  instructionsAr: string;
  fieldsJson: string;
}): TaskSnapshot {
  return {
    taskId: task.id,
    titleEn: task.titleEn,
    titleAr: task.titleAr,
    instructionsEn: task.instructionsEn,
    instructionsAr: task.instructionsAr,
    fields: parseTaskFields(task.fieldsJson),
    capturedAt: new Date().toISOString(),
  };
}

export function parseJsonObject(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function parseSnapshot(json: string): TaskSnapshot | null {
  const raw = parseJsonObject(json);
  if (typeof raw.taskId !== 'string' || !Array.isArray(raw.fields)) return null;
  return raw as unknown as TaskSnapshot;
}

/** Validates submitted work against the task's own field definition.
 *
 *  This is the deterministic gate: required fields must be present and
 *  non-empty, every value must be a string, and each field is length-capped.
 *  Unknown keys are dropped rather than rejected, so the API stays compatible
 *  with an older client while never storing unreviewed keys. */
export function parseWork(input: unknown, fields: TaskFieldDef[]): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Submission must be an object of answers.');
  }
  const source = input as Record<string, unknown>;
  const work: Record<string, string> = {};
  const missing: string[] = [];
  for (const field of fields) {
    const raw = source[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length > MAX_FIELD_LENGTH) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Field "${field.key}" is longer than ${MAX_FIELD_LENGTH} characters.`);
    }
    if (field.required && value.length === 0) missing.push(field.key);
    work[field.key] = value;
  }
  if (missing.length > 0) {
    throw new HttpError(400, 'REQUIRED_FIELDS_MISSING', `These answers are required: ${missing.join(', ')}.`);
  }
  return work;
}

/** Finds or creates this learner's single attempt at the simulation's first
 *  task, then makes sure any event whose trigger time has passed is delivered.
 *  Starting a task twice resumes the same attempt: one learner, one playthrough,
 *  one submission - which is what makes the evidence unambiguous. */
export async function startOrResumeAttempt(userId: string, idOrSlug: string) {
  const simulation = await prisma.simulation.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { tasks: { orderBy: { order: 'asc' }, take: 1 } },
  });
  if (!simulation) throw new HttpError(404, 'SIMULATION_NOT_FOUND', 'That simulation does not exist.');
  if (!simulation.isActive) throw new HttpError(409, 'SIMULATION_INACTIVE', 'That simulation is not open for new attempts.');
  const task = simulation.tasks[0];
  if (!task) throw new HttpError(409, 'SIMULATION_NOT_READY', 'That simulation has no task yet.');

  const attempt = await prisma.simulationAttempt.upsert({
    where: { userId_taskId: { userId, taskId: task.id } },
    update: {}, // A resumed attempt keeps its draft, snapshot and clock.
    create: {
      userId,
      simulationId: simulation.id,
      taskId: task.id,
      taskSnapshotJson: JSON.stringify(buildTaskSnapshot(task)),
    },
  });
  await deliverDueEvents(attempt.id);
  return attempt.id;
}

/** Delivers every event whose trigger time has elapsed since the attempt
 *  started, exactly once per attempt. Delivery is derived from the clock, so
 *  the workspace does not need a background worker: any request that touches
 *  the attempt brings its inbox up to date, and AttemptEvent keeps the record
 *  of what the learner actually received before submitting. */
export async function deliverDueEvents(attemptId: string) {
  const attempt = await prisma.simulationAttempt.findUnique({
    where: { id: attemptId },
    include: { eventDeliveries: { select: { eventId: true } } },
  });
  if (!attempt) throw new HttpError(404, 'ATTEMPT_NOT_FOUND', 'That attempt does not exist.');

  const elapsedMinutes = Math.floor((Date.now() - attempt.createdAt.getTime()) / 60_000);
  const dueEvents = await prisma.simulationEvent.findMany({
    where: { simulationId: attempt.simulationId, triggerMinutes: { lte: elapsedMinutes } },
    orderBy: [{ triggerMinutes: 'asc' }, { order: 'asc' }],
  });

  const alreadyDelivered = new Set(attempt.eventDeliveries.map((delivery) => delivery.eventId));
  for (const event of dueEvents) {
    if (alreadyDelivered.has(event.id)) continue;
    try {
      await prisma.attemptEvent.create({ data: { attemptId, eventId: event.id } });
    } catch {
      // Two concurrent requests may both see the event as new; the unique
      // (attemptId, eventId) constraint makes the loser a no-op.
    }
  }
  return dueEvents;
}
