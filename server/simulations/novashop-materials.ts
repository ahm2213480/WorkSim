import type { SeedMaterial } from './types.js';

/** NovaShop materials. The support ticket and the acceptance criteria are
 *  authored in both languages; the source file is a real code artifact, so
 *  identifiers stay as they are and only its comments are localized. */
export const novaShopMaterials: SeedMaterial[] = [
  {
    kind: 'BUG_REPORT',
    titleEn: 'Support escalation #4821 — checkout failing on mobile',
    titleAr: 'تصعيد الدعم ‎#4821 — فشل الدفع على الهاتف',
    contentEn: `From: support@novashop.example
Subject: ESCALATION — customers cannot pay from phones

Three tickets in two days, all the same pattern:

#479 (iOS Safari, 14:12) — "I added two items, pressed Pay, and the total
jumped back to 0.00 and the button did nothing. I gave up and ordered
from another store."

#481 (Android Chrome, 19:40) — "The screen freezes for a second when I
change the quantity, then the order total shows 0. Pay never goes
through."

#483 (iPhone, 22:05) — "It worked on my laptop. On the phone the total
disappears and the Pay button spins forever."

Support notes:
- Desktop orders are unaffected.
- Every failed order stopped at the checkout summary step.
- Marketing estimates ~30 lost orders since Monday.
- Two reporters said they had changed the item quantity before paying.`,
    contentAr: `من: support@novashop.example
الموضوع: تصعيد — العملاء لا يستطيعون الدفع من الهواتف

ثلاث تذاكر خلال يومين، وكلها بالنمط نفسه:

#479 (سفاري على آيفون، 14:12) — "أضفت قطعتين وضغطت زر الدفع، فقفز
الإجمالي إلى 0.00 ولم يفعل الزر شيئًا. تركت المحاولة واشتريت من متجر آخر."

‎#481 (كروم على أندرويد، 19:40) — "الشاشة تتجمّد لحظة عند تغيير الكمية،
ثم يظهر الإجمالي صفرًا، والدفع لا يكتمل أبدًا."

#483 (آيفون، 22:05) — "اشتغل على الحاسوب المحمول بشكل سليم. على الهاتف
يختفي الإجمالي ويدور زر الدفع بلا نهاية."

ملاحظات الدعم:
- طلبات الحاسوب سليمة تمامًا.
- كل طلب فاشل توقّف عند خطوة ملخّص الدفع.
- تقدير التسويق: فقدنا نحو 30 طلبًا منذ الاثنين.
- مبلّغان ذكرا أنهما غيّرا كمية المنتج قبل الدفع.`,
    order: 1,
  },
  {
    kind: 'CODE',
    titleEn: 'CheckoutSummary.tsx — the component under suspicion',
    titleAr: 'CheckoutSummary.tsx — المكوّن المشتبه به',
    contentEn: `// components/checkout/CheckoutSummary.tsx
// Renders the order total and the Pay button. Shared by the desktop
// checkout page and the mobile CheckoutSheet.

export function CheckoutSummary({ cart }: { cart: Cart }) {
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState<OrderSummary | null>(null);

  useEffect(() => {
    const total = cart.items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    setOrder({ itemCount: cart.items.length, total: formatMoney(total) });
  }, [cart.items.length]);   // <-- dependency list

  async function handlePay() {
    if (!order) return;
    setPaying(true);
    await api.pay(order.total);   // <-- amount sent to the gateway
    setPaying(false);
  }

  return (
    <section className="checkout">
      <p>Items: {order?.itemCount ?? 0}</p>
      <p data-testid="order-total">Total: {order?.total ?? formatMoney(0)}</p>
      <button onClick={handlePay} disabled={paying}>
        {paying ? 'Processing…' : 'Pay now'}
      </button>
    </section>
  );
}

// components/cart/QuickQuantityStepper.tsx
// Mobile-only stepper. Desktop uses QuantityStepper, which dispatches
// explicit cart actions instead.

export function QuickQuantityStepper({ cart, onChange }: Props) {
  function bump(index: number, delta: number) {
    cart.items[index].qty += delta;  // <-- mutates the item in place
    onChange(cart);                  // <-- same array reference
  }
  return cart.items.map((item, i) => (
    <div key={item.id}>
      <button onClick={() => bump(i, -1)}>-</button>
      <span>{item.qty}</span>
      <button onClick={() => bump(i, +1)}>+</button>
    </div>
  ));
}

// app/mobile/CheckoutSheet.tsx (excerpt)
// The mobile sheet mounts as soon as the user opens the cart drawer,
// while useCart() is still resolving. Desktop mounts CheckoutPage only
// after the cart hook reports it is loaded.
const { cart, isLoaded } = useCart();
return <CheckoutSummary cart={cart} />;`,
    contentAr: `// components/checkout/CheckoutSummary.tsx
// يعرض إجمالي الطلب وزر الدفع. مشترك بين صفحة الدفع على الحاسوب
// ولوحة الدفع على الهاتف (CheckoutSheet).

export function CheckoutSummary({ cart }: { cart: Cart }) {
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState<OrderSummary | null>(null);

  useEffect(() => {
    const total = cart.items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    setOrder({ itemCount: cart.items.length, total: formatMoney(total) });
  }, [cart.items.length]);   // <-- قائمة التبعيات

  async function handlePay() {
    if (!order) return;
    setPaying(true);
    await api.pay(order.total);   // <-- المبلغ المرسل إلى بوابة الدفع
    setPaying(false);
  }

  return (
    <section className="checkout">
      <p>عدد القطع: {order?.itemCount ?? 0}</p>
      <p data-testid="order-total">الإجمالي: {order?.total ?? formatMoney(0)}</p>
      <button onClick={handlePay} disabled={paying}>
        {paying ? 'جارٍ المعالجة…' : 'ادفع الآن'}
      </button>
    </section>
  );
}

// components/cart/QuickQuantityStepper.tsx
// عدّاد مخصص للهاتف. أما الحاسوب فيستخدم QuantityStepper الذي يرسل
// إجراءات سلة صريحة (actions) بدل التعديل المباشر.

export function QuickQuantityStepper({ cart, onChange }: Props) {
  function bump(index: number, delta: number) {
    cart.items[index].qty += delta;  // <-- يعدّل الكمية في نفس الكائن
    onChange(cart);                  // <-- نفس مرجع المصفوفة
  }
  return cart.items.map((item, i) => (
    <div key={item.id}>
      <button onClick={() => bump(i, -1)}>-</button>
      <span>{item.qty}</span>
      <button onClick={() => bump(i, +1)}>+</button>
    </div>
  ));
}

// app/mobile/CheckoutSheet.tsx (مقتطف)
// تُثبَّت لوحة الهاتف بمجرد فتح السلة، أي قبل أن ينتهي useCart() من
// تحميل السلة. أما الحاسوب فلا يُثبّت CheckoutPage إلا بعد اكتمال التحميل.
const { cart, isLoaded } = useCart();
return <CheckoutSummary cart={cart} />;`,
    order: 2,
  },
  {
    kind: 'REQUIREMENTS',
    titleEn: 'Acceptance criteria from the team lead',
    titleAr: 'معايير القبول من قائد الفريق',
    contentEn: `Omar (team lead) wrote down what "fixed" means for this bug:

1. Changing quantity must update the displayed total, and the amount sent
   to the gateway must equal the displayed total.
2. The Pay button must never send 0.00. While the correct total is unknown,
   the button stays disabled.
3. Your write-up must explain WHY the bug appeared on mobile only, in one
   paragraph a support agent could understand.
4. A teammate must be able to verify the fix from your test plan without
   asking you any questions.
5. Do not change the API or the payment-gateway contract in this fix.
6. Ship the smallest change that satisfies 1–5; the checkout file is shared
   with desktop, so desktop behaviour must not regress.`,
    contentAr: `كتب عمر (قائد الفريق) معنى "تم الإصلاح" لهذا الخطأ:

1. تغيير الكمية يجب أن يحدّث الإجمالي المعروض، والمبلغ المرسل إلى بوابة
   الدفع يجب أن يساوي الإجمالي المعروض.
2. يجب ألا يُرسل زر الدفع 0.00 أبدًا. وما دام الإجمالي الصحيح غير معروف،
   يبقى الزر معطّلًا.
3. يجب أن يشرح تقريرك سبب ظهور الخطأ على الهاتف فقط، في فقرة واحدة
   يفهمها موظف الدعم.
4. يجب أن يستطيع زميلك التحقق من الإصلاح عبر خطة اختبارك دون أن يسألك
   أي سؤال.
5. لا تغيّر واجهة الـ API أو عقد بوابة الدفع في هذا الإصلاح.
6. سلّم أصغر تغيير يحقق البنود 1–5؛ ملف الدفع مشترك مع الحاسوب، فيجب
   ألا يتراجع سلوك الحاسوب.`,
    order: 3,
  },
];