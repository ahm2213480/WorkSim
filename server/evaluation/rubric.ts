import { z } from 'zod';
import { HttpError } from '../http-error.js';

/** One input field of the submission form, stored as JSON on
 *  SimulationTask.fieldsJson. `kind: "code"` renders a monospace editor in the
 *  workspace; labels are bilingual because the whole workspace is. */
export interface TaskFieldDef {
  key: string;
  kind: 'text' | 'code';
  labelEn: string;
  labelAr: string;
  multiline: boolean;
  required: boolean;
}

const taskFieldDefSchema = z.object({
  key: z.string().min(1).max(60),
  kind: z.enum(['text', 'code']),
  labelEn: z.string().min(1).max(200),
  labelAr: z.string().min(1).max(200),
  multiline: z.boolean(),
  required: z.boolean(),
});

function parseJson(json: string, code: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new HttpError(500, code, 'Task content is malformed.');
  }
}

export function parseTaskFields(fieldsJson: string): TaskFieldDef[] {
  const parsed = taskFieldDefSchema.array().safeParse(parseJson(fieldsJson, 'FIELD_SCHEMA_INVALID'));
  if (!parsed.success) throw new HttpError(500, 'FIELD_SCHEMA_INVALID', 'Task submission form is malformed.');
  const keys = new Set(parsed.data.map((field) => field.key));
  if (keys.size !== parsed.data.length) {
    throw new HttpError(500, 'FIELD_SCHEMA_INVALID', 'Task submission form has duplicate fields.');
  }
  return parsed.data;
}

/** One deterministic rubric criterion. `check` describes an objective test on
 *  one submission field; `requiresEvent` (optional) ties the criterion to a
 *  mid-task SimulationEvent id - the criterion only counts when the learner
 *  actually received that event before submitting. */
export interface RubricCheck {
  kind: 'nonEmpty' | 'minLength' | 'includesAny' | 'includesAll' | 'hasNumber';
  field: string;
  values?: string[];
  min?: number;
}

export interface RubricCriterion {
  key: string;
  weight: number;
  labelEn: string;
  labelAr: string;
  check: RubricCheck;
  requiresEvent?: string;
}

export interface Rubric {
  version: string;
  criteria: RubricCriterion[];
}

const rubricCheckSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('nonEmpty'), field: z.string().min(1) }),
  z.object({ kind: z.literal('minLength'), field: z.string().min(1), min: z.number().int().positive() }),
  z.object({ kind: z.literal('includesAny'), field: z.string().min(1), values: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('includesAll'), field: z.string().min(1), values: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('hasNumber'), field: z.string().min(1) }),
]);

const rubricCriterionSchema = z.object({
  key: z.string().min(1).max(80),
  weight: z.number().int().positive().max(100),
  labelEn: z.string().min(1).max(200),
  labelAr: z.string().min(1).max(200),
  check: rubricCheckSchema,
  requiresEvent: z.string().min(1).max(120).optional(),
});

const rubricSchema = z.object({
  version: z.string().min(1).max(40),
  criteria: rubricCriterionSchema.array().min(1),
});

export function parseRubric(checklistJson: string): Rubric {
  const parsed = rubricSchema.safeParse(parseJson(checklistJson, 'RUBRIC_INVALID'));
  if (!parsed.success) throw new HttpError(500, 'RUBRIC_INVALID', 'Task rubric is malformed.');
  return parsed.data;
}

export interface EvaluatedCriterion {
  key: string;
  weight: number;
  labelEn: string;
  labelAr: string;
  met: boolean;
  skipped: boolean;
  skipReason?: 'EVENT_NOT_DELIVERED';
  evidence: string;
}

export interface EvaluationResult {
  rubricVersion: string;
  score: number;
  maxScore: number;
  criteria: EvaluatedCriterion[];
}

/** Deterministic evaluation of a work product against the task rubric.
 *
 *  Design rules (documented in docs/ARCHITECTURE.md):
 *  - Objective checks only: presence, length, and keyword signals on the exact
 *    fields the task defined. This is a completeness check, never proof of
 *    technical correctness - qualitative judgement belongs to AI feedback and
 *    mentor review, which are advisory and separate.
 *  - A criterion with `requiresEvent` is skipped (and excluded from maxScore)
 *    when that event was never delivered to the attempt, so a learner is never
 *    scored down for work they were never asked to do.
 *  - Keyword checks are case-insensitive and include the Arabic equivalents of
 *    every signal, because learners may answer in either locale.
 */
export function evaluateWork(rubric: Rubric, work: Record<string, string>, deliveredEventIds: ReadonlySet<string>): EvaluationResult {
  const criteria = rubric.criteria.map((criterion): EvaluatedCriterion => {
    if (criterion.requiresEvent && !deliveredEventIds.has(criterion.requiresEvent)) {
      return {
        key: criterion.key,
        weight: criterion.weight,
        labelEn: criterion.labelEn,
        labelAr: criterion.labelAr,
        met: false,
        skipped: true,
        skipReason: 'EVENT_NOT_DELIVERED',
        evidence: 'not delivered before submission',
      };
    }
    const raw = work[criterion.check.field] ?? '';
    const value = String(raw).trim();
    const lower = value.toLowerCase();
    let met: boolean;
    let evidence: string;
    switch (criterion.check.kind) {
      case 'nonEmpty': {
        met = value.length > 0;
        evidence = `${criterion.check.field}: ${met ? 'filled' : 'empty'}`;
        break;
      }
      case 'minLength': {
        met = value.length >= (criterion.check.min ?? 1);
        evidence = `${criterion.check.field}: ${value.length} chars (min ${criterion.check.min})`;
        break;
      }
      case 'hasNumber': {
        // \p{Nd} (Unicode decimal digits) matches both "3" and "٣", so an
        // answer written in Arabic digits is not scored as missing a number.
        met = /\p{Nd}/u.test(value);
        evidence = `${criterion.check.field}: number ${met ? 'present' : 'absent'}`;
        break;
      }
      case 'includesAny': {
        const hit = (criterion.check.values ?? []).find((signal) => lower.includes(signal.toLowerCase()));
        met = hit !== undefined;
        evidence = met ? `${criterion.check.field}: matched "${hit}"` : `${criterion.check.field}: no expected signal found`;
        break;
      }
      case 'includesAll': {
        const missing = (criterion.check.values ?? []).filter((signal) => !lower.includes(signal.toLowerCase()));
        met = missing.length === 0;
        evidence = met
          ? `${criterion.check.field}: all ${criterion.check.values?.length ?? 0} signals present`
          : `${criterion.check.field}: missing ${missing.join(', ')}`;
        break;
      }
    }
    return {
      key: criterion.key,
      weight: criterion.weight,
      labelEn: criterion.labelEn,
      labelAr: criterion.labelAr,
      met,
      skipped: false,
      evidence,
    };
  });
  const scored = criteria.filter((criterion) => !criterion.skipped);
  return {
    rubricVersion: rubric.version,
    score: scored.filter((criterion) => criterion.met).reduce((total, criterion) => total + criterion.weight, 0),
    maxScore: scored.reduce((total, criterion) => total + criterion.weight, 0),
    criteria,
  };
}