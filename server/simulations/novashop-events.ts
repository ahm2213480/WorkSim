import type { SeedEvent } from './types.js';

/** NovaShop in-simulation events.
 *
 *  `guest-checkout-update` is the connected requirement change required by the
 *  assessment: it arrives mid-task, changes what must be submitted, and the
 *  rubric scores the learner's response to it. `ios-safari-detail` narrows the
 *  diagnosis with information that was genuinely unavailable at task start —
 *  both are tied to this scenario's code, not random interruptions. */
export const novaShopEvents: SeedEvent[] = [
  {
    key: 'ios-safari-detail',
    kind: 'CUSTOMER_FEEDBACK',
    fromName: 'Sara Haddad',
    fromRole: 'Support lead',
    titleEn: 'Sara re-tested on a real phone — new detail',
    titleAr: 'سارة أعادت الاختبار على هاتف حقيقي — تفصيلة جديدة',
    bodyEn: `I reproduced #479 on my own phone just now, and there is a detail the tickets missed:

The moment the cart drawer opens, the summary already says "Total: 0.00" — before I touch anything. When I add one more item from inside the drawer, the total corrects itself and the payment goes through.

So the total is not wrong because of arithmetic. It is wrong on first render, and it only fixes itself when the item COUNT changes. Adjusting the quantity with the mobile +/- buttons does not fix it.

Hope that narrows it down — I am back on tickets until you need more repro steps.`,
    bodyAr: `أعدت إنتاج التذكرة #479 على هاتفي الآن، وهناك تفصيلة لم ترصدها التذاكر:

بمجرد أن تُفتح سلة المشتريات يظهر في الملخّص "الإجمالي: 0.00" قبل أن ألمس أي شيء. وعندما أضيف قطعة أخرى من داخل السلة، يصحّ الإجمالي نفسه ويكتمل الدفع.

إذن الإجمالي ليس خطأً حسابيًا؛ إنه خطأ في أول عرض، ولا يصحّ إلا عندما يتغيّر عدد القطع. أما تعديل الكمية بزرّي +/- في الهاتف فلا يصلحه.

أتمنى أن يضيّق هذا نطاق البحث — سأعود إلى التذاكر حتى تحتاج خطوات إضافية.`,
    triggerMinutes: 5,
    order: 1,
  },
  {
    key: 'guest-checkout-update',
    kind: 'REQUIREMENT_CHANGE',
    fromName: 'Omar Sultan',
    fromRole: 'Frontend team lead',
    titleEn: 'Requirement change: guest checkout must work on mobile too',
    titleAr: 'تغيير متطلب: الدفع كزائر يجب أن يعمل على الهاتف أيضًا',
    bodyEn: `Update while you work — the client just clarified the scope:

GUEST checkout (no account) must also work on mobile. It turns out most of the drop-offs are guests, so fixing only the signed-in flow would miss the real problem.

Add a short guest-checkout plan to your submission and mention it explicitly in your root-cause write-up.

This is now part of the acceptance criteria, so it will be reviewed with everything else. Nothing else changes.`,
    bodyAr: `تحديث أثناء عملك — أوضح العميل النطاق الآن:

الدفع كزائر (بدون حساب) يجب أن يعمل على الهاتف أيضًا. اتضح أن معظم الطلبات المتروكة من الزوار، لذا إصلاح مسار المستخدم المسجّل فقط لن يحل المشكلة الحقيقية.

أضف خطة قصيرة للدفع كزائر إلى تسليمك، واذكرها صراحة في تقرير السبب الجذري.

هذا البند أصبح الآن جزءًا من معايير القبول، وسيُراجع مع بقية البنود. لا شيء آخر تغيّر.`,
    triggerMinutes: 12,
    order: 2,
  },
];
