import type { SeedMaterial } from './types.js';

/** MarketFlow materials.
 *
 *  The dataset is synthetic but internally consistent: every figure quoted in
 *  the manager's message, the data dictionary and the rubric can be recomputed
 *  from the CSV. Material 3 (the data dictionary) also documents the
 *  deliberate October caveat, which is the data-quality trap the method
 *  criterion scores. */
export const marketFlowMaterials: SeedMaterial[] = [
  {
    kind: 'MESSAGE',
    titleEn: 'Message from the analytics manager',
    titleAr: 'رسالة من مديرة التحليلات',
    contentEn: `From: Nadia Kamal — Analytics Manager
To: Commercial Analytics
Subject: North region — need an answer before Thursday

Hi,

At Monday's commercial review the regional director asked why North revenue
has been falling since early summer, and we did not have an answer. "It is
seasonal" is not an answer — Central is flat over the same months.

I pulled the monthly export myself this morning (attached, plus the SKU
price list and our data dictionary). Finance has signed off on the January
to September totals.

What I need from you:

- Which months actually moved, with the numbers.
- What changed in the business at that time — not a guess, evidence from
  the data we have.
- How much of the drop each factor explains, so we can prioritise.
- One recommendation I can put in front of the regional director.

Keep it to a page. If something in the data is unreliable, say so instead of
building on it.

The regional director is a commercial person, not an analyst, so avoid
jargon and avoid charts for their own sake.

Thanks,
Nadia`,
    contentAr: `من: نادية كمال — مديرة التحليلات
إلى: فريق التحليلات التجارية
الموضوع: المنطقة الشمالية — أحتاج إجابة قبل الخميس

مرحبًا،

في مراجعة الاثنين سأل مدير المنطقة عن سبب انخفاض إيرادات الشمال منذ بداية
الصيف، ولم يكن لدينا جواب. عبارة "الموسمية" ليست جوابًا — فالمنطقة الوسطى
مستقرّة في الأشهر نفسها.

استخرجتُ ملف المبيعات الشهرية بنفسي هذا الصباح (مرفق مع قائمة أسعار
المنتجات وقاموس البيانات). وقد وقّعت المالية على إجماليات الفترة من يناير
إلى سبتمبر.

ما أحتاجه منك:

- أي الأشهر تحرّكت فعلًا، مع الأرقام.
- ما الذي تغيّر في الأعمال في ذلك الوقت — بالدليل من البيانات المتاحة، لا
  بالتخمين.
- نصيب كل عامل من الانخفاض، حتى نعرف أولوية المعالجة.
- توصية واحدة أستطيع عرضها على مدير المنطقة.

اجعل الجواب في صفحة واحدة. وإذا كان في البيانات ما لا يُعتمد عليه، قل ذلك
بدل البناء عليه.

مدير المنطقة شخص تجاري لا محلّل، فتجنّب المصطلحات وتجنّب الرسوم البيانية
لغير ضرورة.

شكرًا،
نادية`,
    order: 1,
  },
  {
    kind: 'DATASET',
    titleEn: 'Monthly commercial export — Jan to Oct (north_decline_export.csv)',
    titleAr: 'ملف المبيعات الشهرية — يناير إلى أكتوبر (north_decline_export.csv)',
    contentEn: `month,region,orders,gross_revenue_sar,units_returned
2026-01,North,1180,411820,24
2026-02,North,1140,397860,21
2026-03,North,1210,422290,26
2026-04,North,1165,406585,22
2026-05,North,1198,418102,25
2026-06,North,1102,384600,27
2026-07,North,946,330150,62
2026-08,North,902,314800,58
2026-09,North,921,321430,60
2026-01,Central,1755,604200,35
2026-02,Central,1780,611800,33
2026-03,Central,1740,598400,36
2026-04,Central,1795,615900,34
2026-05,Central,1810,622300,38
2026-06,Central,1792,617500,35
2026-07,Central,1770,609800,37
2026-08,Central,1785,614200,36
2026-09,Central,1802,621000,39
2026-01,South,700,248900,14
2026-02,South,718,255300,15
2026-03,South,708,251700,13
2026-04,South,702,249100,14
2026-05,South,728,258600,16
2026-06,South,710,252400,15
2026-07,South,698,247800,14
2026-08,South,704,250100,15
2026-09,South,715,253900,16
2026-10,North,268,93500,0
2026-10,Central,512,176300,0
2026-10,South,214,76200,0`,
    contentAr: `month,region,orders,gross_revenue_sar,units_returned
2026-01,North,1180,411820,24
2026-02,North,1140,397860,21
2026-03,North,1210,422290,26
2026-04,North,1165,406585,22
2026-05,North,1198,418102,25
2026-06,North,1102,384600,27
2026-07,North,946,330150,62
2026-08,North,902,314800,58
2026-09,North,921,321430,60
2026-01,Central,1755,604200,35
2026-02,Central,1780,611800,33
2026-03,Central,1740,598400,36
2026-04,Central,1795,615900,34
2026-05,Central,1810,622300,38
2026-06,Central,1792,617500,35
2026-07,Central,1770,609800,37
2026-08,Central,1785,614200,36
2026-09,Central,1802,621000,39
2026-01,South,700,248900,14
2026-02,South,718,255300,15
2026-03,South,708,251700,13
2026-04,South,702,249100,14
2026-05,South,728,258600,16
2026-06,South,710,252400,15
2026-07,South,698,247800,14
2026-08,South,704,250100,15
2026-09,South,715,253900,16
2026-10,North,268,93500,0
2026-10,Central,512,176300,0
2026-10,South,214,76200,0`,
    order: 2,
  },
  {
    kind: 'DATASET',
    titleEn: 'Product reference: Chairs Pro price change and North unit sales',
    titleAr: 'مرجع المنتج: تغيير سعر كراسي برو ومبيعات الوحدات في الشمال',
    contentEn: `# sku_price_list.csv
sku,sku_name,category,list_price_sar,last_change
SKU-1140,Chairs Pro,Furniture,620,Increased from 480 on 2026-06-01 (supplier change)
SKU-1180,Desk Lamp,Lighting,95,No change in 2026
SKU-1210,Standing Desk,Furniture,1450,No change in 2026
SKU-1320,Monitor Arm,Accessories,210,No change in 2026

# sku_units_north.csv  (Chairs Pro, North region only)
month,sku,units_sold
2026-04,SKU-1140,268
2026-05,SKU-1140,271
2026-06,SKU-1140,242
2026-07,SKU-1140,146
2026-08,SKU-1140,124
2026-09,SKU-1140,129

# Procurement note (from the category buyer, 28 May)
The previous supplier discontinued this line in May. The only qualified
alternative charges more, so the list price went from SAR 480 to SAR 620
on 1 June in every region.

# Commercial note (from North sales reps, 20 August)
Two reps have raised this twice: a competitor now lists an equivalent chair
at SAR 520 and is actively targeting our North accounts. The reps say
customers quote that price when they cancel Chairs Pro orders. No formal
quote has been collected yet.`,
    contentAr: `# sku_price_list.csv
sku,sku_name,category,list_price_sar,last_change
SKU-1140,Chairs Pro,Furniture,620,زاد من 480 في 2026-06-01 (تغيير مورد)
SKU-1180,Desk Lamp,Lighting,95,بدون تغيير في 2026
SKU-1210,Standing Desk,Furniture,1450,بدون تغيير في 2026
SKU-1320,Monitor Arm,Accessories,210,بدون تغيير في 2026

# sku_units_north.csv  (كراسي برو، المنطقة الشمالية فقط)
month,sku,units_sold
2026-04,SKU-1140,268
2026-05,SKU-1140,271
2026-06,SKU-1140,242
2026-07,SKU-1140,146
2026-08,SKU-1140,124
2026-09,SKU-1140,129

# ملاحظة المشتريات (من مسؤول الفئة، 28 مايو)
أوقف المورد السابق هذا الخط في مايو. والمورد البديل المؤهّل الوحيد يطلب
سعرًا أعلى، لذا ارتفع سعر البيع من 480 إلى 620 ريالًا في 1 يونيو في كل
المناطق.

# ملاحظة تجارية (من مندوبي مبيعات الشمال، 20 أغسطس)
رفع مندوبان هذه الملاحظة مرتين: ينافس الآن متجر منافس بكرسي مماثل بسعر
520 ريالًا ويستهدف حساباتنا في الشمال بشكل مباشر. يقول المندوبان إن
العملاء يذكرون هذا السعر عند إلغاء طلبات كراسي برو. لا يوجد عرض سعر رسمي
موثّق بعد.`,
    order: 3,
  },
  {
    kind: 'REQUIREMENTS',
    titleEn: 'Data dictionary and known export caveats',
    titleAr: 'قاموس البيانات والتحذيرات المعروفة في الملف',
    contentEn: `# Column definitions (monthly commercial export)

month               Closing month, format YYYY-MM.
region              North / Central / South.
orders              Orders placed in the month; cancellations not included.
gross_revenue_sar   Order value BEFORE returns are deducted.
units_returned      Units returned during the month and refunded at list price.

# Known caveats — read before calculating

1. gross_revenue_sar is NOT net revenue. To compare regions fairly, deduct
   units_returned at list price (see sku_price_list.csv for prices).
2. The October rows are a PARTIAL extract: the file was pulled on 8 October
   for the commercial review. October returns are not reconciled yet and show
   0, and the month is incomplete. Do not use October in month-over-month
   trend statements.
3. Revenue is recorded at list price. Discounts are booked separately by
   finance and are not in this export.

# What this export cannot tell you

- WHY volumes moved (no customer-level or cancellation data here).
- Whether a price change caused cancellations directly.
- Anything about stock levels or delivery performance.`,
    contentAr: `# تعريف الأعمدة (ملف المبيعات الشهرية)

month               الشهر المغلق، بصيغة YYYY-MM.
region              الشمال / الوسط / الجنوب.
orders              الطلبات المُنشأة خلال الشهر، ولا تشمل الطلبات الملغاة.
gross_revenue_sar   قيمة الطلب قبل خصم الإرجاعات.
units_returned      الوحدات المرتجعة خلال الشهر والمستردّة بسعر البيع.

# تحذيرات معروفة — اقرأها قبل الحساب

1. العمود gross_revenue_sar ليس صافي الإيراد. وللمقارنة العادلة بين المناطق،
   اخصم الوحدات المرتجعة بسعر البيع (الأسعار في sku_price_list.csv).
2. صفوف أكتوبر مقتطف جزئي: استُخرج الملف في 8 أكتوبر لأجل المراجعة
   التجارية. وإرجاعات أكتوبر لم تُسوَّ بعد وتظهر صفرًا، والشهر غير مكتمل. لا
   تستخدم أكتوبر في أي حديث عن الاتجاه الشهري.
3. تُسجَّل الإيرادات بسعر البيع، أما الخصومات فتقيّدها المالية منفصلة ولا
   تظهر في هذا الملف.

# ما لا يستطيع هذا الملف إخبارك به

- سبب تغيّر الكميات (لا توجد بيانات عملاء أو إلغاءات هنا).
- ما إذا كان تغيير السعر سبب الإلغاءات مباشرة.
- أي شيء عن مستويات المخزون أو أداء التوصيل.`,
    order: 4,
  },
];