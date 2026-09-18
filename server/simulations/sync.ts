import type { PrismaClient } from '@prisma/client';
import { prisma as defaultClient } from '../db.js';
import { ALL_SIMULATIONS, SKILLS } from './index.js';

/** Seeds the skill catalog. Skills are curriculum, not user data: the same
 *  slugs and labels must exist in every environment because simulation content
 *  and rubric criteria reference them. */
export async function syncSkills(client: PrismaClient = defaultClient) {
  const skillIdBySlug = new Map<string, string>();
  for (const skill of SKILLS) {
    const row = await client.skill.upsert({
      where: { slug: skill.slug },
      update: { nameEn: skill.nameEn, nameAr: skill.nameAr },
      create: skill,
    });
    skillIdBySlug.set(skill.slug, row.id);
  }
  return skillIdBySlug;
}

/** Publishes the code-authored simulation content into the database.
 *
 *  Idempotent and rerunnable. Materials are replaced wholesale because nothing
 *  references them; events and tasks are upserted on their stable keys because
 *  attempts do reference them, and re-seeding must never repoint a learner's
 *  attempt (which would silently rewrite their evidence). */
export async function syncCatalog(client: PrismaClient = defaultClient) {
  const skillIdBySlug = await syncSkills(client);

  for (const seed of ALL_SIMULATIONS) {
    const content = {
      company: seed.company,
      roleTitleEn: seed.roleTitleEn,
      roleTitleAr: seed.roleTitleAr,
      titleEn: seed.titleEn,
      titleAr: seed.titleAr,
      summaryEn: seed.summaryEn,
      summaryAr: seed.summaryAr,
      briefEn: seed.briefEn,
      briefAr: seed.briefAr,
      estimatedMinutes: seed.estimatedMinutes,
      sortOrder: seed.sortOrder,
    };
    const simulation = await client.simulation.upsert({
      where: { slug: seed.slug },
      update: content,
      create: { ...content, slug: seed.slug },
    });

    await client.simulationMaterial.deleteMany({ where: { simulationId: simulation.id } });
    for (const material of seed.materials) {
      await client.simulationMaterial.create({ data: { ...material, simulationId: simulation.id } });
    }

    for (const event of seed.events) {
      const { key, ...rest } = event;
      await client.simulationEvent.upsert({
        where: { simulationId_key: { simulationId: simulation.id, key } },
        update: rest,
        create: { ...rest, key, simulationId: simulation.id },
      });
    }

    for (const task of seed.tasks) {
      const data = {
        titleEn: task.titleEn,
        titleAr: task.titleAr,
        instructionsEn: task.instructionsEn,
        instructionsAr: task.instructionsAr,
        fieldsJson: JSON.stringify(task.fields),
        checklistJson: JSON.stringify(task.rubric),
      };
      await client.simulationTask.upsert({
        where: { simulationId_order: { simulationId: simulation.id, order: task.order } },
        update: data,
        create: { ...data, order: task.order, simulationId: simulation.id },
      });
    }

    // Skill links carry the rubric criterion that proves each skill. They are
    // rebuilt per simulation so a content change cannot leave a stale link.
    await client.simulationSkill.deleteMany({ where: { simulationId: simulation.id } });
    for (const link of seed.skills) {
      const skillId = skillIdBySlug.get(link.slug);
      if (!skillId) throw new Error(`Simulation ${seed.slug} references unknown skill "${link.slug}"`);
      await client.simulationSkill.create({
        data: { simulationId: simulation.id, skillId, checklistKey: link.checklistKey ?? null },
      });
    }
  }

  return { simulations: ALL_SIMULATIONS.length, skills: SKILLS.length };
}