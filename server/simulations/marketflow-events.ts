import type { SeedEvent } from './types.js';

/** MarketFlow in-simulation events.
 *
 *  `quality-note` supplies evidence the learner could not have had at task
 *  start (which SKU and which reason code drive the returns spike).
 *  `impact-request` is the mid-task requirement change: management adds a
 *  quantified recovery estimate to the deliverable, and the rubric scores the
 *  learner's response to it. */
export const marketFlowEvents: SeedEvent[] = [
  {
    key: 'quality-note',
    kind: 'MANAGER_MESSAGE',
    fromName: 'Bilal Rahman',
    fromRole: 'Customer Support lead',
    titleEn: 'Support: the returns are all one product',
    titleAr: 'الدعم: الإرجاعات كلها على منتج واحد',
    bodyEn: `Nadia asked me to send you this before you finish.

I broke down the North returns for July to September. 168 of the 180 returned units are Chairs Pro (SKU-1140). The reason code on almost every one is "damaged on arrival".

The timeline matches our supplier change: the first shipment from the new supplier landed in the North fulfilment centre in the last week of June. Support photos show the issue — the batch shipped without armrests, and the packaging was single-layer instead of double.

The other 12 returned units are spread across lamps and monitor arms and look like normal accidental damage.

That is everything support has on this.`,
    bodyAr: `طلبت نادية أن أرسل لك هذا قبل أن تُنهي عملك.

حلّلتُ إرجاعات المنطقة الشمالية من يوليو إلى سبتمبر. 168 وحدة من أصل 180 مرتجعة هي من منتج كراسي برو (SKU-1140)، ورمز السبب في معظمها "تالف عند الوصول".

ويتوافق التوقيت مع تغيير المورد: وصلت أول شحنة من المورد الجديد إلى مركز التوزيع الشمالي في الأسبوع الأخير من يونيو. وتُظهر صور الدعم المشكلة: الشحنة وصلت بدون مساند أذرع، والتغليف كان طبقة واحدة بدل طبقتين.

الوحدات الاثنتا عشرة الأخرى موزّعة على المصابيح وحوامل الشاشات وتبدو تلفًا عرضيًا معتادًا.

هذا كل ما لدى فريق الدعم في هذا الموضوع.`,
    triggerMinutes: 5,
    order: 1,
  },
  {
    key: 'impact-request',
    kind: 'REQUIREMENT_CHANGE',
    fromName: 'Nadia Kamal',
    fromRole: 'Analytics Manager',
    titleEn: 'Additional ask: quantify the recovery',
    titleAr: 'طلب إضافي: احسب العائد المتوقع بالأرقام',
    bodyEn: `One more thing before you submit — the regional director replied to my message.

Findings alone will not move this forward. He wants to know what it is worth to fix it: if we correct the quality problem and review the Chairs Pro price, what does the North region recover per quarter?

Give me one number with the assumption behind it written in a sentence. It does not need to be a forecast model — a defensible estimate based on the numbers you already have is what he asked for.

Please add it to your submission. It is now part of what we review.`,
    bodyAr: `أمر أخير قبل التسليم — وصلني ردّ مدير المنطقة على رسالتي.

النتائج وحدها لن تحرّك شيئًا. يريد أن يعرف قيمة الإصلاح: إذا عالجنا مشكلة الجودة وأعدنا النظر في سعر كراسي برو، فما مقدار ما تستعيده المنطقة الشمالية في الربع؟

أعطني رقمًا واحدًا مع افتراضه مكتوبًا في جملة. لا يُطلب نموذج توقّع — يكفي تقدير مسنود بالأرقام التي لديك.

أضفه إلى تسليمك، فهو الآن جزء مما نراجعه.`,
    triggerMinutes: 12,
    order: 2,
  },
];
