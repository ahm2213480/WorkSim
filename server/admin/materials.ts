import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../http-error.js';
import { loadSimulationOrThrow } from './service.js';

// Materials are referenced by nothing (attempts snapshot the task, not the
// materials), so add/edit/delete freely. A reseed replaces seeded rows
// wholesale — documented in the UI.

const materialInputSchema = z.object({
  order: z.number().int().min(0).max(10000),
  kind: z.string().trim().min(1).max(40),
  titleEn: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  contentEn: z.string().trim().min(1).max(60000),
  contentAr: z.string().trim().min(1).max(60000),
});

export type MaterialInput = z.infer<typeof materialInputSchema>;

export function parseMaterialInput(body: unknown): MaterialInput {
  const parsed = materialInputSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid material data.');
  return parsed.data;
}

export async function getAdminMaterial(materialId: string) {
  const material = await prisma.simulationMaterial.findUnique({ where: { id: materialId } });
  if (!material) throw new HttpError(404, 'MATERIAL_NOT_FOUND', 'That material does not exist.');
  return {
    id: material.id,
    simulationId: material.simulationId,
    order: material.order,
    kind: material.kind,
    titleEn: material.titleEn,
    titleAr: material.titleAr,
    contentEn: material.contentEn,
    contentAr: material.contentAr,
  };
}

export async function createAdminMaterial(simulationIdOrSlug: string, input: MaterialInput) {
  const simulation = await loadSimulationOrThrow(simulationIdOrSlug);
  const created = await prisma.simulationMaterial.create({ data: { ...input, simulationId: simulation.id } });
  return { id: created.id };
}

export async function updateAdminMaterial(materialId: string, input: MaterialInput) {
  const material = await prisma.simulationMaterial.findUnique({ where: { id: materialId }, select: { id: true } });
  if (!material) throw new HttpError(404, 'MATERIAL_NOT_FOUND', 'That material does not exist.');
  const updated = await prisma.simulationMaterial.update({ where: { id: material.id }, data: input });
  return { id: updated.id };
}

export async function deleteAdminMaterial(materialId: string): Promise<void> {
  const material = await prisma.simulationMaterial.findUnique({ where: { id: materialId }, select: { id: true } });
  if (!material) throw new HttpError(404, 'MATERIAL_NOT_FOUND', 'That material does not exist.');
  await prisma.simulationMaterial.delete({ where: { id: material.id } });
}
