import type { Locale } from '../locale.js';

/** Row shapes this module localizes. Declared structurally (not by importing
 *  Prisma types) so the same builders work for rows loaded with or without
 *  relations, and so a payload change shows up as a type error here. */
interface LocalizableSimulation {
  id: string;
  slug: string;
  company: string;
  roleTitleEn: string;
  roleTitleAr: string;
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  briefEn: string;
  briefAr: string;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface SimulationListItem {
  id: string;
  slug: string;
  company: string;
  roleTitle: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  skills: { slug: string; name: string }[];
  taskCount: number;
  materialCount: number;
}

export interface SimulationDetail extends SimulationListItem {
  brief: string;
  isActive: boolean;
  /** Materials now carry their localized content so the workspace can render
   *  the actual artifacts (e.g. the buggy NovaShop component) in place. */
  materials: { id: string; kind: string; title: string; content: string }[];
  tasks: { id: string; order: number; title: string }[];
}

export function pick(locale: Locale, en: string, ar: string): string {
  return locale === 'AR' ? ar : en;
}

export function toListItem(
  simulation: LocalizableSimulation,
  locale: Locale,
  skills: { slug: string; nameEn: string; nameAr: string }[],
  counts: { tasks: number; materials: number },
): SimulationListItem {
  return {
    id: simulation.id,
    slug: simulation.slug,
    company: simulation.company,
    roleTitle: pick(locale, simulation.roleTitleEn, simulation.roleTitleAr),
    title: pick(locale, simulation.titleEn, simulation.titleAr),
    summary: pick(locale, simulation.summaryEn, simulation.summaryAr),
    estimatedMinutes: simulation.estimatedMinutes,
    skills: skills.map((skill) => ({ slug: skill.slug, name: pick(locale, skill.nameEn, skill.nameAr) })),
    taskCount: counts.tasks,
    materialCount: counts.materials,
  };
}

export function toDetail(
  simulation: LocalizableSimulation,
  locale: Locale,
  skills: { slug: string; nameEn: string; nameAr: string }[],
  materials: { id: string; kind: string; titleEn: string; titleAr: string; contentEn: string; contentAr: string }[],
  tasks: { id: string; order: number; titleEn: string; titleAr: string }[],
): SimulationDetail {
  return {
    ...toListItem(simulation, locale, skills, { tasks: tasks.length, materials: materials.length }),
    brief: pick(locale, simulation.briefEn, simulation.briefAr),
    isActive: simulation.isActive,
    materials: materials.map((material) => ({
      id: material.id,
      kind: material.kind,
      title: pick(locale, material.titleEn, material.titleAr),
      content: pick(locale, material.contentEn, material.contentAr),
    })),
    tasks: tasks.map((task) => ({ id: task.id, order: task.order, title: pick(locale, task.titleEn, task.titleAr) })),
  };
}
