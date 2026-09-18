import { novaShopEvents } from './novashop-events.js';
import { novaShopMaterials } from './novashop-materials.js';
import { novaShopTask } from './novashop-task.js';
import type { SimulationSeed } from './types.js';

/** NovaShop — Junior Frontend Developer.
 *
 *  Scenario: mobile checkout silently loses orders. The learner receives a
 *  support escalation, the offending component, and the team lead's acceptance
 *  criteria. A customer-feedback event narrows the diagnosis, then a
 *  requirement change (guest checkout) arrives mid-task and the deterministic
 *  rubric scores the learner's response to it. */
export const novaShop: SimulationSeed = {
  slug: 'novashop-mobile-checkout',
  company: 'NovaShop',
  roleTitleEn: 'Junior Frontend Developer',
  roleTitleAr: 'مطوّر واجهات أمامية مبتدئ',
  titleEn: 'Fix the mobile checkout that is losing orders',
  titleAr: 'أصلح صفحة الدفع التي تُفقد الطلبات على الهاتف',
  summaryEn: 'Customers report that checkout fails on phones. Investigate the checkout code, find the root cause, and ship a fix proposal.',
  summaryAr: 'يبلّغ العملاء أن إتمام الشراء يفشل على الهواتف. تحقّق من كود الدفع، واعثر على السبب الجذري، وقدّم مقترح إصلاح.',
  briefEn: `You are joining NovaShop as a junior frontend developer. NovaShop is a two-year-old online store selling electronics and home accessories; the four-person frontend team owns the customer web app.

Last week support escalated a spike in abandoned orders: customers on phones reach the checkout summary but cannot complete payment. Desktop orders are unaffected.

Your task this morning is to reproduce the problem from the reports, diagnose the root cause in the checkout code, and deliver a fix proposal the team can review. This is what your first week normally looks like: a real bug, real code, and a teammate waiting for your answer.`,
  briefAr: `تنضم إلى NovaShop كمطوّر واجهات أمامية مبتدئ. NovaShop متجر إلكتروني عمره سنتان يبيع الإلكترونيات ومستلزمات المنزل، ويتولى فريق الواجهات المكوّن من أربعة أفراد تطبيق العملاء.

الأسبوع الماضي رفع فريق الدعم تصعيدًا حول زيادة الطلبات المتروكة: العملاء على الهواتف يصلون إلى ملخّص الطلب ثم لا يستطيعون إكمال الدفع. أما طلبات الحاسوب فسليمة.

مهمتك هذا الصباح أن تعيد إنتاج المشكلة من التقارير، وتشخّص السبب الجذري في كود الدفع، وتسلّم مقترح إصلاح يستطيع الفريق مراجعته. هكذا يبدو أسبوعك الأول فعلًا: خطأ حقيقي، وكود حقيقي، وزميل ينتظر جوابك.`,
  estimatedMinutes: 45,
  sortOrder: 1,
  skills: [
    { slug: 'debugging', checklistKey: 'diagnosis-mechanism' },
    { slug: 'responsive-design', checklistKey: 'patch-recomputes-total' },
    { slug: 'communication', checklistKey: 'test-plan' },
  ],
  materials: novaShopMaterials,
  events: novaShopEvents,
  tasks: [novaShopTask],
};
