import { marketFlowEvents } from './marketflow-events.js';
import { marketFlowMaterials } from './marketflow-materials.js';
import { marketFlowTask } from './marketflow-task.js';
import type { SimulationSeed } from './types.js';

/** MarketFlow — Junior Data Analyst.
 *
 *  Scenario: revenue in the North region fell sharply from July. The learner
 *  gets a raw monthly export, an SKU price list, a data dictionary with a
 *  documented export caveat, and a message from the analytics manager. A
 *  support note narrows the returns driver; a later request from management
 *  adds a quantified recommendation to the deliverable. */
export const marketFlow: SimulationSeed = {
  slug: 'marketflow-sales-decline',
  company: 'MarketFlow',
  roleTitleEn: 'Junior Data Analyst',
  roleTitleAr: 'محلّل بيانات مبتدئ',
  titleEn: 'Investigate why North region revenue fell',
  titleAr: 'حقّق في انخفاض إيرادات المنطقة الشمالية',
  summaryEn: 'Management sees a revenue decline. Work from the raw sales export to find the drivers and recommend an action.',
  summaryAr: 'تشير الإدارة إلى انخفاض في الإيرادات. ابدأ من ملف المبيعات الخام لتحديد الأسباب والتوصية بإجراء.',
  briefEn: `You are joining MarketFlow, a B2B marketplace for office supplies, as a junior data analyst on the commercial analytics team.

At Monday's commercial review, management asked a simple question: revenue from the North region has fallen since early summer and nobody can explain why with numbers. The analyst who owns the North dashboard is on leave, so the data export landed on your desk.

Your job today is not to build a dashboard. It is to answer the question: what actually changed, how much of the decline does each factor explain, and what should the business do next? The finance team signed off on the export, so treat the numbers as authoritative — but read the data dictionary before you calculate anything.

Write your answer for a non-technical commercial director: short, specific, and backed by numbers.`,
  briefAr: `تنضم إلى MarketFlow، وهي منصّة تجارية لمستلزمات المكاتب، كمحلّل بيانات مبتدئ في فريق التحليلات التجارية.

في مراجعة الاثنين، سألت الإدارة سؤالًا بسيطًا: إيرادات المنطقة الشمالية انخفضت منذ بداية الصيف ولا أحد يستطيع تفسير السبب بالأرقام. والمحلّل المسؤول عن لوحة المنطقة الشمالية في إجازة، فوصل ملف البيانات إلى مكتبك.

مهمتك اليوم ليست بناء لوحة معلومات، بل الإجابة عن السؤال: ما الذي تغيّر فعلًا؟ وما نصيب كل عامل من الانخفاض؟ وما الخطوة التالية للأعمال؟ وقّع فريق المالية على الملف، فتعامل مع الأرقام كمرجع موثوق، لكن اقرأ قاموس البيانات قبل أن تحسب أي شيء.

اكتب إجابتك لمدير تجاري غير تقني: قصيرة، ومحدّدة، ومسنودة بالأرقام.`,
  estimatedMinutes: 50,
  sortOrder: 2,
  skills: [
    { slug: 'data-analysis', checklistKey: 'quantifies-decline' },
    { slug: 'business-insight', checklistKey: 'returns-driver' },
    { slug: 'data-storytelling', checklistKey: 'recommendation' },
  ],
  materials: marketFlowMaterials,
  events: marketFlowEvents,
  tasks: [marketFlowTask],
};
