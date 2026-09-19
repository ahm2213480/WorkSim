import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../http-error.js';
import { parseRubric, parseTaskFields } from '../evaluation/rubric.js';
import { loadSimulationOrThrow } from './service.js';

// Tasks: attempts snapshot the task at start (taskSnapshotJson), so an edit
// never rewrites in-flight or historical learner work — only new starts use
// the updated content.

const taskInputSchema = z.object({
  order: z.number().int().min(0).max(1000),
  titleEn: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  instructionsEn: z.string().trim().min(1).max(12000),
  instructionsAr: z.string().trim().min(1).max(12000),
  fieldsJson: z.string().min(2),
  checklistJson: z.string().min(2),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export function parseTaskInput(body: unknown): TaskInput {
  const parsed = taskInputSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid task data.');
  // Reuse the evaluation parsers so an admin can never save a task the
  // submission path would 500 on. Those parsers throw 500-class operational
  // errors for stored content; here the content is client input, so any
  // failure is a 400 VALIDATION_ERROR instead.
  try {
    parseTaskFields(parsed.data.fieldsJson);
    parseRubric(parsed.data.checklistJson);
  } catch (error) {
    if (error instanceof HttpError) throw validationError(error.message);
    throw error;
  }
  return parsed.data;
}

export async function getAdminTask(taskId: string) {
  const task = await prisma.simulationTask.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'That task does not exist.');
  return {
    id: task.id,
    simulationId: task.simulationId,
    order: task.order,
    titleEn: task.titleEn,
    titleAr: task.titleAr,
    instructionsEn: task.instructionsEn,
    instructionsAr: task.instructionsAr,
    fieldsJson: task.fieldsJson,
    checklistJson: task.checklistJson,
  };
}

export async function createAdminTask(simulationIdOrSlug: string, input: TaskInput) {
  const simulation = await loadSimulationOrThrow(simulationIdOrSlug);
  const clash = await prisma.simulationTask.findUnique({
    where: { simulationId_order: { simulationId: simulation.id, order: input.order } },
    select: { id: true },
  });
  if (clash) throw new HttpError(409, 'TASK_ORDER_TAKEN', 'That simulation already has a task with this order.');
  const created = await prisma.simulationTask.create({ data: { ...input, simulationId: simulation.id } });
  return { id: created.id };
}

export async function updateAdminTask(taskId: string, input: TaskInput) {
  const task = await prisma.simulationTask.findUnique({ where: { id: taskId }, select: { id: true, simulationId: true } });
  if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'That task does not exist.');
  const clash = await prisma.simulationTask.findUnique({
    where: { simulationId_order: { simulationId: task.simulationId, order: input.order } },
    select: { id: true },
  });
  if (clash && clash.id !== task.id) throw new HttpError(409, 'TASK_ORDER_TAKEN', 'That simulation already has a task with this order.');
  const updated = await prisma.simulationTask.update({ where: { id: task.id }, data: input });
  return { id: updated.id };
}
