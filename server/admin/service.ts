import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../http-error.js';
import type { Locale } from '../locale.js';
import { parseRubric, parseTaskFields } from '../evaluation/rubric.js';
import { pick } from '../simulations/view.js';

/** Admin catalog management. Every mutation is gated by requireRole('ADMIN')
 *  on the route (server/admin/routes.ts); the service validates payloads with
 *  zod and reuses the same rubric/field parsers the evaluation path uses, so
 *  an admin can never save a task whose form or rubric would 500 at submit.
 *
 *  Safety notes:
 *  - Deleting simulations/tasks is intentionally NOT offered: attempts and
 *    submissions reference these rows, so removal would orphan learner
 *    evidence. Deactivation (isActive=false) hides a simulation instead.
 *  - Code-authored content (server/simulations/*.ts) is republished by
 *    syncCatalog() on `npm run db:seed`; a reseed overwrites DB edits to
 *    seeded rows. Documented in the UI and README. */

const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and hyphens.');

const simulationInputSchema = z.object({
  slug: slugSchema,
  company: z.string().trim().min(1).max(120),
  roleTitleEn: z.string().trim().min(1).max(200),
  roleTitleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  summaryEn: z.string().trim().min(1).max(2000),
  summaryAr: z.string().trim().min(1).max(2000),
  briefEn: z.string().trim().min(1).max(8000),
  briefAr: z.string().trim().min(1).max(8000),
  estimatedMinutes: z.number().int().min(1).max(10080),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

export type SimulationInput = z.infer<typeof simulationInputSchema>;

export function parseSimulationInput(body: unknown): SimulationInput {
  const parsed = simulationInputSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid simulation data.');
  return parsed.data;
}

export interface AdminSimulationItem {
  id: string;
  slug: string;
  company: string;
  title: string;
  isActive: boolean;
  estimatedMinutes: number;
  taskCount: number;
  materialCount: number;
  attemptCount: number;
}

export async function listAdminSimulations(locale: Locale): Promise<AdminSimulationItem[]> {
  const rows = await prisma.simulation.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { tasks: true, materials: true, attempts: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    company: row.company,
    title: pick(locale, row.titleEn, row.titleAr),
    isActive: row.isActive,
    estimatedMinutes: row.estimatedMinutes,
    taskCount: row._count.tasks,
    materialCount: row._count.materials,
    attemptCount: row._count.attempts,
  }));
}

export interface AdminTaskSummary {
  id: string; order: number; titleEn: string; titleAr: string;
  fieldCount: number; criterionCount: number;
}

export interface AdminSimulationDetail {
  id: string; slug: string; company: string;
  roleTitleEn: string; roleTitleAr: string;
  titleEn: string; titleAr: string;
  summaryEn: string; summaryAr: string;
  briefEn: string; briefAr: string;
  estimatedMinutes: number; sortOrder: number; isActive: boolean;
  taskCount: number; materialCount: number; attemptCount: number;
  tasks: AdminTaskSummary[];
  materials: { id: string; order: number; kind: string; titleEn: string; titleAr: string }[];
}

export async function loadSimulationOrThrow(idOrSlug: string) {
  const simulation = await prisma.simulation.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      tasks: { orderBy: { order: 'asc' } },
      materials: { orderBy: { order: 'asc' } },
      _count: { select: { tasks: true, materials: true, attempts: true } },
    },
  });
  if (!simulation) throw new HttpError(404, 'SIMULATION_NOT_FOUND', 'That simulation does not exist.');
  return simulation;
}

export async function getAdminSimulation(idOrSlug: string): Promise<AdminSimulationDetail> {
  const simulation = await loadSimulationOrThrow(idOrSlug);
  return {
    id: simulation.id,
    slug: simulation.slug,
    company: simulation.company,
    roleTitleEn: simulation.roleTitleEn,
    roleTitleAr: simulation.roleTitleAr,
    titleEn: simulation.titleEn,
    titleAr: simulation.titleAr,
    summaryEn: simulation.summaryEn,
    summaryAr: simulation.summaryAr,
    briefEn: simulation.briefEn,
    briefAr: simulation.briefAr,
    estimatedMinutes: simulation.estimatedMinutes,
    sortOrder: simulation.sortOrder,
    isActive: simulation.isActive,
    taskCount: simulation._count.tasks,
    materialCount: simulation._count.materials,
    attemptCount: simulation._count.attempts,
    tasks: simulation.tasks.map((task) => {
      // Counts only — the editor loads full JSON on demand per task.
      let fieldCount = 0;
      let criterionCount = 0;
      try { fieldCount = parseTaskFields(task.fieldsJson).length; } catch { /* editor surfaces it */ }
      try { criterionCount = parseRubric(task.checklistJson).criteria.length; } catch { /* editor surfaces it */ }
      return { id: task.id, order: task.order, titleEn: task.titleEn, titleAr: task.titleAr, fieldCount, criterionCount };
    }),
    materials: simulation.materials.map((material) => ({
      id: material.id, order: material.order, kind: material.kind, titleEn: material.titleEn, titleAr: material.titleAr,
    })),
  };
}

export async function createAdminSimulation(input: SimulationInput): Promise<{ id: string; slug: string }> {
  const existing = await prisma.simulation.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (existing) throw new HttpError(409, 'SLUG_TAKEN', 'A simulation with that slug already exists.');
  const created = await prisma.simulation.create({ data: input });
  return { id: created.id, slug: created.slug };
}

export async function updateAdminSimulation(idOrSlug: string, input: SimulationInput): Promise<{ id: string; slug: string }> {
  const simulation = await loadSimulationOrThrow(idOrSlug);
  if (input.slug !== simulation.slug) {
    const clash = await prisma.simulation.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (clash) throw new HttpError(409, 'SLUG_TAKEN', 'A simulation with that slug already exists.');
  }
  const updated = await prisma.simulation.update({ where: { id: simulation.id }, data: input });
  return { id: updated.id, slug: updated.slug };
}

const toggleSchema = z.object({ isActive: z.boolean() });

export function parseToggle(body: unknown): boolean {
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) throw validationError('isActive must be a boolean.');
  return parsed.data.isActive;
}

export async function setSimulationActive(idOrSlug: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
  const simulation = await loadSimulationOrThrow(idOrSlug);
  const updated = await prisma.simulation.update({ where: { id: simulation.id }, data: { isActive } });
  return { id: updated.id, isActive: updated.isActive };
}
