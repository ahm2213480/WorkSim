import type { SeedTask } from './types.js';

/** MarketFlow's task: deliverable fields plus the deterministic rubric.
 *
 *  The rubric deliberately scores METHOD (did the learner respect the export's
 *  caveats, did they quantify, did they separate the two drivers) rather than
 *  one "correct" answer, because the dataset supports two real drivers. The
 *  `impact-estimate` criterion is tied to the `impact-request` event and is
 *  skipped when that event was never delivered. */
export const marketFlowTask: SeedTask = {
  order: 1,
  titleEn: 'Explain the North revenue decline and recommend an action',
  titleAr: 'اشرح انخفاض إيرادات الشمال واوصِ بإجراء',
  instructionsEn: `Work as the analyst who owns this question this week. Everything you need is on your desk.

1. Identify the months where the trend actually changed, with numbers.
2. Separate the drivers you can see in the data and quantify each one's
   contribution to the decline.
3. State clearly what the data cannot tell you, and which caveat limits your
   numbers.
4. Recommend one action for the regional director, with the reasoning.

New messages from the team will arrive while you work — they may add to the deliverable. Save a draft any time; submit when you are ready.`,
  instructionsAr: `اعمل كمحلّل البيانات المسؤول عن هذا السؤال هذا الأسبوع. كل ما تحتاجه موجود على مكتبك.

1. حدّد الأشهر التي تغيّر فيها الاتجاه فعلًا، مع الأرقام.
2. افصل العوامل الظاهرة في البيانات، وقِس نصيب كل عامل من الانخفاض.
3. اذكر بوضوح ما لا تستطيع البيانات إخبارك به، وأي تحذير يحدّ من دقة أرقامك.
4. اوصِ بإجراء واحد لمدير المنطقة، مع تبريره.

ستصلك رسائل من الفريق أثناء العمل، وقد تضيف شيئًا إلى تسليمك. احفظ مسودة في أي وقت، وسلّم عندما تكون جاهزًا.`,
  fields: [
    { key: 'findings', kind: 'text', labelEn: 'Findings: what changed and where', labelAr: 'النتائج: ما الذي تغيّر وأين', multiline: true, required: true },
    { key: 'drivers', kind: 'text', labelEn: 'Driver breakdown with numbers', labelAr: 'تحليل العوامل بالأرقام', multiline: true, required: true },
    { key: 'limitations', kind: 'text', labelEn: 'Caveats and what the data cannot show', labelAr: 'التحذيرات وما لا تُظهره البيانات', multiline: true, required: true },
    { key: 'recommendation', kind: 'text', labelEn: 'Recommendation for the regional director', labelAr: 'التوصية لمدير المنطقة', multiline: true, required: true },
    { key: 'impactEstimate', kind: 'text', labelEn: 'Recovery estimate (if the added request reached you)', labelAr: 'تقدير العائد (إن وصل إليك الطلب الإضافي)', multiline: true, required: false },
  ],
  rubric: {
    version: 'marketflow-decline-r1',
    criteria: [
      {
        key: 'locates-decline',
        weight: 15,
        labelEn: 'Locates the decline in the right months, with numbers',
        labelAr: 'يحدّد أشهر الانخفاض بالأرقام',
        check: { kind: 'includesAny', field: 'findings', values: ['july', 'jul', 'august', 'يوليو', 'أغسطس'] },
      },
      {
        key: 'quantifies-decline',
        weight: 10,
        labelEn: 'Quantifies how large the decline is',
        labelAr: 'يقيس حجم الانخفاض',
        check: { kind: 'hasNumber', field: 'drivers' },
      },
      {
        key: 'returns-driver',
        weight: 20,
        labelEn: 'Identifies the returns/quality driver',
        labelAr: 'يحدّد عامل الإرجاعات والجودة',
        check: { kind: 'includesAny', field: 'drivers', values: ['return', 'returned', 'refund', 'quality', 'defect', 'sku-1140', 'مرتجع', 'إرجاع', 'جودة', 'عيب', 'تالف'] },
      },
      {
        key: 'price-driver',
        weight: 20,
        labelEn: 'Identifies the price/competition driver',
        labelAr: 'يحدّد عامل السعر والمنافسة',
        check: { kind: 'includesAny', field: 'drivers', values: ['price', '620', '480', 'competitor', 'سعر', 'منافس'] },
      },
      {
        key: 'data-caveat',
        weight: 15,
        labelEn: 'Flags the unreliable October extract',
        labelAr: 'يشير إلى عدم موثوقية مقتطف أكتوبر',
        check: { kind: 'includesAny', field: 'limitations', values: ['october', 'partial', 'incomplete', 'not reconciled', 'أكتوبر', 'جزئي', 'غير مكتمل', 'لم تُسوَّ', 'لم تسو'] },
      },
      {
        key: 'recommendation',
        weight: 10,
        labelEn: 'Gives one clear recommendation',
        labelAr: 'يقدّم توصية واحدة واضحة',
        check: { kind: 'minLength', field: 'recommendation', min: 120 },
      },
      {
        key: 'impact-estimate',
        weight: 10,
        labelEn: 'Responds to the request to quantify the recovery',
        labelAr: 'يستجيب لطلب قياس العائد بالأرقام',
        check: { kind: 'hasNumber', field: 'impactEstimate' },
        requiresEvent: 'impact-request',
      },
    ],
  },
};