import type { SeedTask } from './types.js';

/** NovaShop's task: the exact fields the learner submits and the deterministic
 *  rubric used to score them.
 *
 *  Weights total 100 when every criterion is in scope. `guest-update` is tied
 *  to the `guest-checkout-update` event, so it is skipped (and removed from the
 *  maximum) if that event was never delivered — a learner is never penalised
 *  for a requirement they never received. Keyword checks list the Arabic
 *  equivalents because a learner may answer in either language. */
export const novaShopTask: SeedTask = {
  order: 1,
  titleEn: 'Diagnose the mobile checkout bug and propose a fix',
  titleAr: 'شخّص خطأ الدفع على الهاتف واقترح إصلاحًا',
  instructionsEn: `Work as the developer on call for this bug. Use the materials on your desk.

1. Reproduce it on paper: which exact sequence triggers the bug?
2. Find the ROOT CAUSE in the code and explain why it only affects mobile.
3. Write the corrected code for the component.
4. Write a test plan a teammate can follow on a real phone.
5. Estimate how long the fix and its testing would take.

Messages from the team will arrive while you work — they change what is expected. Save a draft any time; submit when you are ready.`,
  instructionsAr: `اعمل كمطوّر مسؤول عن هذا الخطأ. استخدم المواد الموجودة على مكتبك.

1. أعد إنتاج المشكلة نظريًا: ما التسلسل الدقيق الذي يُظهر الخطأ؟
2. اعثر على السبب الجذري في الكود واشرح لماذا يظهر على الهاتف فقط.
3. اكتب الكود المصحّح للمكوّن.
4. اكتب خطة اختبار يستطيع زميلك تنفيذها على هاتف حقيقي.
5. قدّر الوقت اللازم للإصلاح واختباره.

ستصلك رسائل من الفريق أثناء العمل، وهي تغيّر المطلوب منك. احفظ مسودة في أي وقت، وسلّم عندما تكون جاهزًا.`,
  fields: [
    { key: 'diagnosis', kind: 'text', labelEn: 'Root-cause write-up', labelAr: 'تقرير السبب الجذري', multiline: true, required: true },
    { key: 'patch', kind: 'code', labelEn: 'Proposed fix (code)', labelAr: 'الإصلاح المقترح (كود)', multiline: true, required: true },
    { key: 'testPlan', kind: 'text', labelEn: 'Test plan for a teammate', labelAr: 'خطة اختبار للزميل', multiline: true, required: true },
    { key: 'guestPlan', kind: 'text', labelEn: 'Guest checkout plan (if the requirement change reached you)', labelAr: 'خطة الدفع كزائر (إن وصل إليك تغيير المتطلب)', multiline: true, required: false },
    { key: 'estimate', kind: 'text', labelEn: 'Time estimate', labelAr: 'التقدير الزمني', multiline: false, required: true },
  ],
  rubric: {
    version: 'novashop-checkout-r1',
    criteria: [
      {
        key: 'diagnosis-mechanism',
        weight: 15,
        labelEn: 'Diagnosis names a plausible mechanism',
        labelAr: 'التشخيص يسمّي آلية معقولة للخطأ',
        check: { kind: 'includesAny', field: 'diagnosis', values: ['state', 'effect', 'dependency', 'hydration', 'reference', 'mutation', 'الحالة', 'مؤثر', 'تبعية', 'مرجع'] },
      },
      {
        key: 'diagnosis-mobile-only',
        weight: 15,
        labelEn: 'Explains why the bug is mobile-only',
        labelAr: 'يشرح سبب اقتصار الخطأ على الهاتف',
        check: { kind: 'minLength', field: 'diagnosis', min: 200 },
      },
      {
        key: 'patch-recomputes-total',
        weight: 20,
        labelEn: 'Fix makes the total recompute from the cart',
        labelAr: 'الإصلاح يجعل الإجمالي يُحتسب من السلة',
        check: { kind: 'includesAll', field: 'patch', values: ['cart.items', 'total'] },
      },
      {
        key: 'patch-guard-zero',
        weight: 15,
        labelEn: 'Pay path can no longer send 0.00',
        labelAr: 'مسار الدفع لم يعد يرسل 0.00',
        check: { kind: 'includesAny', field: 'patch', values: ['disabled', '!order', 'isloaded', '0.00', '=== 0'] },
      },
      {
        key: 'test-plan',
        weight: 15,
        labelEn: 'Test plan covers quantity, guest and regression',
        labelAr: 'خطة الاختبار تغطي الكمية والزائر وعدم التراجع',
        check: { kind: 'includesAny', field: 'testPlan', values: ['quantity', 'guest', 'desktop', 'الكمية', 'زائر', 'الحاسوب'] },
      },
      {
        key: 'guest-update',
        weight: 10,
        labelEn: 'Responds to the guest-checkout requirement change',
        labelAr: 'يستجيب لتغيير متطلب الدفع كزائر',
        check: { kind: 'nonEmpty', field: 'guestPlan' },
        requiresEvent: 'guest-checkout-update',
      },
      {
        key: 'estimate',
        weight: 10,
        labelEn: 'Gives a time estimate',
        labelAr: 'يقدّم تقديرًا زمنيًا',
        check: { kind: 'hasNumber', field: 'estimate' },
      },
    ],
  },
};