import { describe, expect, it } from 'vitest';
import { HttpError } from '../http-error.js';
import { evaluateWork, parseRubric, parseTaskFields, type Rubric } from './rubric.js';

const rubric: Rubric = {
  version: 'test-1',
  criteria: [
    { key: 'diagnosis', weight: 25, labelEn: 'Diagnosis names a mechanism', labelAr: 'التشخيص يسمّي آلية الخطأ', check: { kind: 'includesAny', field: 'diagnosis', values: ['state', 'validation', 'الحالة', 'تحقق'] } },
    { key: 'patch', weight: 40, labelEn: 'Patch touches the right places', labelAr: 'التعديل يلامس المواضع الصحيحة', check: { kind: 'includesAll', field: 'patch', values: ['cart.items', 'order.total'] } },
    { key: 'guest', weight: 25, labelEn: 'Guest checkout handled', labelAr: 'معالجة الدفع كزائر', check: { kind: 'nonEmpty', field: 'guestPlan' }, requiresEvent: 'guest-checkout-update' },
    { key: 'estimate', weight: 10, labelEn: 'Time estimate given', labelAr: 'تقديم تقدير زمني', check: { kind: 'hasNumber', field: 'estimate' } },
  ],
};

describe('evaluateWork', () => {
  it('scores an empty submission 0 and keeps maxScore at the delivered scope', () => {
    const result = evaluateWork(rubric, {}, new Set());
    expect(result.score).toBe(0);
    // The guest-checkout criterion is tied to an event that was never
    // delivered, so it is skipped and excluded from the maximum.
    expect(result.maxScore).toBe(75);
    expect(result.criteria.find((c) => c.key === 'guest')?.skipped).toBe(true);
    expect(result.criteria.every((c) => c.evidence.length > 0)).toBe(true);
  });

  it('includes the event criterion only when that event was actually delivered', () => {
    const delivered = new Set(['guest-checkout-update']);
    const passing = { diagnosis: 'The bug is in the validation of the cart state', patch: 'cart.items.forEach(...); order.total = ...', guestPlan: 'Reuse the signed-in flow for guests with an email capture step.', estimate: '3 hours' };
    expect(evaluateWork(rubric, passing, delivered)).toMatchObject({ score: 100, maxScore: 100 });
    expect(evaluateWork(rubric, passing, new Set())).toMatchObject({ score: 75, maxScore: 75 });
  });

  it('matches keywords case-insensitively and in Arabic', () => {
    const arabic = { diagnosis: 'المشكلة في التحقق من الحالة داخل السلة', patch: 'cart.items.map(...)\norder.total = computeTotal()', guestPlan: 'نعتمد نفس مسار الدفع للزائر', estimate: '٣ ساعات' };
    expect(evaluateWork(rubric, arabic, new Set(['guest-checkout-update'])).score).toBe(100);
  });

  it('awards partial credit and reports which signals are missing', () => {
    const result = evaluateWork(rubric, { diagnosis: 'STATE is mutated twice', patch: 'only cart.items is touched', estimate: '2h' }, new Set());
    expect(result.score).toBe(35);
    const patch = result.criteria.find((c) => c.key === 'patch');
    expect(patch?.met).toBe(false);
    expect(patch?.evidence).toContain('missing order.total');
  });

  it('does not invent correctness: presence checks are all it reports', () => {
    const result = evaluateWork(rubric, { diagnosis: 'state state state', patch: 'cart.items order.total', estimate: '1h' }, new Set());
    expect(result.score).toBe(75);
    expect(result.criteria.every((c) => c.met === true)).toBe(false); // guest still skipped
  });
});

describe('parsers', () => {
  it('rejects malformed rubrics and field schemas with a 500 HttpError, not a crash', () => {
    expect(() => parseRubric('not json')).toThrowError(HttpError);
    expect(() => parseRubric('{"version":"v","criteria":[{"key":"a","weight":0,"labelEn":"x","labelAr":"ي","check":{"kind":"nonEmpty","field":"f"}}]}')).toThrowError(HttpError);
    const fields = JSON.stringify([{ key: 'a', kind: 'text', labelEn: 'A', labelAr: 'أ', multiline: true, required: true }, { key: 'a', kind: 'code', labelEn: 'B', labelAr: 'ب', multiline: true, required: false }]);
    expect(() => parseTaskFields(fields)).toThrowError(HttpError);
  });

  it('accepts valid definitions', () => {
    expect(parseRubric(JSON.stringify(rubric)).criteria).toHaveLength(4);
    expect(parseTaskFields(JSON.stringify([{ key: 'patch', kind: 'code', labelEn: 'Patch', labelAr: 'التعديل', multiline: true, required: true }]))[0]?.kind).toBe('code');
  });
});
