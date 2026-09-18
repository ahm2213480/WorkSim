import type { RubricCriterion, TaskFieldDef } from '../evaluation/rubric.js';

/** Bilingual narrative material handed to the learner. Code and datasets keep
 *  their original (English) source and localize only comments, because a real
 *  codebase is not translated per reader. */
export interface SeedMaterial {
  kind: string;
  titleEn: string;
  titleAr: string;
  contentEn: string;
  contentAr: string;
  order: number;
}

/** A timed in-simulation message. `key` is an authoring-time handle used by
 *  rubric criteria (`requiresEvent`) so content stays readable; the database
 *  stores cuid ids and the API maps keys to ids when serving attempts. */
export interface SeedEvent {
  key: string;
  kind: string;
  fromName: string;
  fromRole?: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  triggerMinutes: number;
  order: number;
}

export interface SeedTask {
  order: number;
  titleEn: string;
  titleAr: string;
  instructionsEn: string;
  instructionsAr: string;
  fields: TaskFieldDef[];
  rubric: { version: string; criteria: RubricCriterion[] };
}

export interface SimulationSeed {
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
  sortOrder: number;
  /** Skills this simulation is designed to exercise, optionally tied to the
   *  deterministic rubric item that proves them (`checklistKey`). When a
   *  criterion is met during evaluation, the skill is recorded as demonstrated;
   *  a null key means "recorded whenever the submission is evaluated", which is
   *  honest for skills like communication that no single check can prove. */
  skills: SeedSkillLink[];
  materials: SeedMaterial[];
  events: SeedEvent[];
  tasks: SeedTask[];
}

export interface SeedSkillLink {
  slug: string;
  checklistKey?: string;
}

export interface SeedSkill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export const SKILLS: SeedSkill[] = [
  { slug: 'debugging', nameEn: 'Debugging', nameAr: 'تصحيح الأخطاء' },
  { slug: 'responsive-design', nameEn: 'Responsive UI fixes', nameAr: 'إصلاح الواجهات المتجاوبة' },
  { slug: 'communication', nameEn: 'Technical communication', nameAr: 'التواصل التقني' },
  { slug: 'data-analysis', nameEn: 'Data analysis', nameAr: 'تحليل البيانات' },
  { slug: 'data-storytelling', nameEn: 'Data storytelling', nameAr: 'سرد البيانات' },
  { slug: 'business-insight', nameEn: 'Business insight', nameAr: 'الاستنتاج التجاري' },
];
