import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { SESSION_COOKIE_NAME, createSession } from './auth/sessions.js';
import { hashPassword } from './auth/passwords.js';
import { prisma } from './db.js';

/** End-to-end learner flow through the real HTTP app: browse the catalog, start
 *  a simulation, save a draft, receive a mid-task event, submit, and read back
 *  the deterministic evaluation and work evidence. Deterministic scoring is
 *  verified here (not in the AI layer) because it must hold even when no AI
 *  provider is configured. */

const runId = Date.now().toString(36);
const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000 });

async function learnerHeaders(label: string, locale = 'EN') {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${runId}@test.dev`,
      name: `Learner ${label}`,
      passwordHash: hashPassword('Correct-Horse-1'),
      role: 'LEARNER',
      locale,
    },
  });
  const token = await createSession(user.id);
  return { user, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

const NOVASHOP = 'novashop-mobile-checkout';
const MARKETFLOW = 'marketflow-sales-decline';

afterAll(async () => {
  // The tests below move event trigger times to simulate elapsed work time.
  // Restoring the authored values keeps the seeded catalog identical to
  // server/simulations, so a manual demo after a test run behaves normally.
  for (const [key, minutes] of Object.entries(AUTHORED_TRIGGERS)) {
    await prisma.simulationEvent.updateMany({ where: { key }, data: { triggerMinutes: minutes } });
  }
  await prisma.$disconnect();
});

describe('simulation catalog', () => {
  it('lists both seeded simulations with role, skills and duration', async () => {
    const response = await request(app).get('/api/simulations');
    expect(response.status).toBe(200);
    const slugs = response.body.simulations.map((s: { slug: string }) => s.slug);
    expect(slugs).toEqual(expect.arrayContaining([NOVASHOP, MARKETFLOW]));
    const nova = response.body.simulations.find((s: { slug: string }) => s.slug === NOVASHOP);
    expect(nova).toMatchObject({ company: 'NovaShop', roleTitle: 'Junior Frontend Developer' });
    expect(nova.skills.length).toBeGreaterThan(0);
    expect(nova.materialCount).toBeGreaterThanOrEqual(3);
    expect(nova.taskCount).toBe(1);
    expect(nova.estimatedMinutes).toBeGreaterThan(0);
  });

  it('serves localized content and falls back safely on a bad locale', async () => {
    const arabic = await request(app).get(`/api/simulations/${NOVASHOP}?locale=AR`);
    expect(arabic.status).toBe(200);
    expect(arabic.body.simulation.roleTitle).toBe('مطوّر واجهات أمامية مبتدئ');

    const fallback = await request(app).get(`/api/simulations/${NOVASHOP}?locale=klingon`);
    expect(fallback.status).toBe(200);
    expect(fallback.body.simulation.roleTitle).toBe('Junior Frontend Developer');
  });

  it('returns materials and tasks, and 404s an unknown slug', async () => {
    const detail = await request(app).get(`/api/simulations/${MARKETFLOW}`);
    expect(detail.status).toBe(200);
    expect(detail.body.simulation.materials.map((m: { kind: string }) => m.kind)).toEqual(
      expect.arrayContaining(['MESSAGE', 'DATASET']),
    );
    expect(detail.body.simulation.tasks).toHaveLength(1);

    const missing = await request(app).get('/api/simulations/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SIMULATION_NOT_FOUND');
  });
});
const NOVASHOP_REQUIRED = {
  diagnosis:
    'The effect only runs when cart.items.length changes, so the total state keeps a stale reference on first render. On mobile ' +
    'the checkout sheet mounts before the cart hook resolves, so the stale total is what the learner sees; on desktop the page ' +
    'waits for isLoaded, which is why the bug never appeared there.',
  patch:
    'useEffect(() => {\n  const total = cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  setOrder({ itemCount: cart.items.length, total: formatMoney(total) });\n}, [cart]);\n' +
    'async function handlePay() {\n  if (!order || order.total === formatMoney(0)) return;\n  setPaying(true);\n  await api.pay(order.total);\n  setPaying(false);\n}\n' +
    '<button onClick={handlePay} disabled={paying || !order}>Pay now</button>',
  testPlan:
    '1. On a phone viewport, open the cart and confirm the total is correct before touching anything.\n' +
    '2. Change quantity with +/- and confirm the displayed total and the amount sent to the gateway match.\n' +
    '3. Repeat as a guest (no account) and confirm checkout completes.\n' +
    '4. Regression: repeat steps 1-2 on desktop at 1280px.',
  estimate: 'About 4 hours: 1 to patch and 3 to test on a real device.',
};

describe('attempt workspace', () => {
  it('starts once and resumes the same attempt on a second call', async () => {
    const { Cookie } = await learnerHeaders('start');
    const first = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    expect(second.status).toBe(201);
    expect(second.body.attemptId).toBe(first.body.attemptId);
  });

  it('refuses to start without a session', async () => {
    const response = await request(app).post(`/api/simulations/${NOVASHOP}/start`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('serves the frozen brief and hides another learner\'s attempt', async () => {
    const owner = await learnerHeaders('owner');
    const stranger = await learnerHeaders('stranger');
    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', owner.Cookie);
    const attemptId = started.body.attemptId as string;

    const mine = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', owner.Cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.attempt.task.fields.map((field: { key: string }) => field.key)).toEqual([
      'diagnosis',
      'patch',
      'testPlan',
      'guestPlan',
      'estimate',
    ]);
    expect(mine.body.attempt.events).toEqual([]);
    expect(mine.body.attempt.simulation).toMatchObject({ company: 'NovaShop', roleTitle: 'Junior Frontend Developer' });

    // Ownership is enforced by the query, so a guessed id is indistinguishable
    // from a missing one: no existence leak.
    const foreign = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', stranger.Cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('saves a draft, drops unknown keys and caps oversized answers', async () => {
    const { Cookie } = await learnerHeaders('draft');
    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;

    const saved = await request(app)
      .patch(`/api/attempts/${attemptId}`)
      .set('Cookie', Cookie)
      .send({ draft: { diagnosis: 'half-written thought', admin: 'ignore me', patch: 'x'.repeat(30000) } });
    expect(saved.status).toBe(200);
    expect(typeof saved.body.savedAt).toBe('string');

    const reloaded = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', Cookie);
    expect(Object.keys(reloaded.body.attempt.draft).sort()).toEqual(['diagnosis', 'patch']);
    expect(reloaded.body.attempt.draft.diagnosis).toBe('half-written thought');
    expect(reloaded.body.attempt.draft.patch).toHaveLength(20000);
    expect(reloaded.body.attempt.lastSavedAt).not.toBeNull();
  });

  it('rejects a draft save on an already submitted attempt', async () => {
    const { Cookie } = await learnerHeaders('locked');
    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;
    await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', Cookie)
      .send({ work: NOVASHOP_REQUIRED });

    const blocked = await request(app)
      .patch(`/api/attempts/${attemptId}`)
      .set('Cookie', Cookie)
      .send({ draft: { diagnosis: 'too late' } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ATTEMPT_ALREADY_SUBMITTED');
  });
});

/** Events are delivered from the clock, so the tests move the trigger times
 *  instead of waiting: 0 means "arrived", 999 means "not yet". Authored values
 *  are restored in the final afterAll. */
const AUTHORED_TRIGGERS: Record<string, number> = { 'ios-safari-detail': 5, 'guest-checkout-update': 12 };

async function setTriggers(slug: string, minutes: number) {
  await prisma.simulationEvent.updateMany({ where: { simulation: { slug } }, data: { triggerMinutes: minutes } });
}

const MARKETFLOW_ANSWERS = {
  findings:
    'North gross revenue fell from 384,600 SAR in June to 330,150 in July, 314,800 in August and 321,430 in September: about 166,000 SAR on the quarter. ' +
    'Central stayed flat (609,800 to 621,000) and South was unchanged, so the decline is specific to North.',
  drivers:
    'Two drivers. Returns: returned units went from ~25 per month to 62, 58 and 60, so roughly 180 units on the quarter, 168 of them Chairs Pro SKU-1140. ' +
    'Price: Chairs Pro moved from 480 to 620 SAR on 1 June after the supplier change, and units sold fell from 271 in May to 146 in July and 124 in August. ' +
    'The competitor listing at 520 SAR is reported by sales reps and was not formally quoted.',
  limitations:
    'The October rows are partial: finance had not reconciled them at export time, so October must be excluded from any comparison. ' +
    'The competitor price is reported by reps rather than measured, so it supports a hypothesis. ' +
    'This export alone cannot separate units lost to price from units lost to quality.',
  recommendation:
    'Fix the quality problem first because it is measurable and immediate: hold the new supplier shipment and re-run the packaging and armrest check before the next North allocation, ' +
    'then review Chairs Pro pricing with the category buyer. Recheck North revenue weekly against the July to September baseline.',
};

describe('submission, evaluation and evidence', () => {
  it('receives the mid-task events, scores deterministically and stores evidence', async () => {
    await setTriggers(NOVASHOP, 0);
    const { Cookie, user } = await learnerHeaders('submit');

    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;

    const workspace = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', Cookie);
    expect(workspace.body.attempt.events.map((event: { key: string }) => event.key)).toEqual([
      'ios-safari-detail',
      'guest-checkout-update',
    ]);

    const guestPlan = 'Guests reuse the same summary component after the total fix; the only extra work is skipping the account step.';
    const submitted = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', Cookie)
      .send({ work: { ...NOVASHOP_REQUIRED, guestPlan } });
    expect(submitted.status).toBe(201);

    const evidence = submitted.body.evidence;
    expect(evidence.evaluation.score).toBe(100);
    expect(evidence.evaluation.maxScore).toBe(100);
    expect(evidence.evaluation.percent).toBe(100);
    expect(evidence.evaluation.rubricVersion).toBe('novashop-checkout-r1');
    expect(evidence.evaluation.criteria.find((c: { key: string }) => c.key === 'guest-update')).toMatchObject({ met: true, skipped: false });
    expect(evidence.skills.map((skill: { slug: string }) => skill.slug)).toEqual(
      expect.arrayContaining(['debugging', 'responsive-design', 'communication']),
    );
    expect(evidence.skills.every((skill: { basis: string }) => skill.basis.length > 0)).toBe(true);
    // The timeline is the "how did they handle it" part of the evidence.
    expect(evidence.timeline).toHaveLength(2);
    expect(evidence.timeline.map((entry: { kind: string }) => entry.kind)).toContain('REQUIREMENT_CHANGE');
    expect(evidence.learner).toMatchObject({ id: user.id, name: 'Learner submit' });

    // Same submission, read back through the learner's own endpoint.
    const reread = await request(app).get(`/api/submissions/${evidence.id}`).set('Cookie', Cookie);
    expect(reread.status).toBe(200);
    expect(reread.body.evidence.evaluation.score).toBe(100);
    expect(reread.body.evidence.work.find((field: { key: string }) => field.key === 'patch').value).toContain('cart.items');

    const duplicate = await request(app).post(`/api/attempts/${attemptId}/submit`).set('Cookie', Cookie).send({ work: NOVASHOP_REQUIRED });
    expect(duplicate.status).toBe(409);
  });

  it('skips the mid-task criterion when the change never reached the learner', async () => {
    await setTriggers(NOVASHOP, 999);
    const { Cookie } = await learnerHeaders('noevent');

    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;
    const workspace = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', Cookie);
    expect(workspace.body.attempt.events).toEqual([]);

    const submitted = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', Cookie)
      .send({ work: NOVASHOP_REQUIRED });
    expect(submitted.status).toBe(201);

    const criterion = submitted.body.evidence.evaluation.criteria.find((c: { key: string }) => c.key === 'guest-update');
    expect(criterion).toMatchObject({ skipped: true, skipReason: 'EVENT_NOT_DELIVERED' });
    // The skipped criterion is removed from the maximum, so a learner is never
    // penalised for a requirement they were never given.
    expect(submitted.body.evidence.evaluation.maxScore).toBe(90);
    expect(submitted.body.evidence.timeline).toEqual([]);
  });

  it('refuses an incomplete submission with a field-level reason', async () => {
    await setTriggers(NOVASHOP, 999);
    const { Cookie } = await learnerHeaders('incomplete');
    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;

    const response = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', Cookie)
      .send({ work: { diagnosis: 'only one answer' } });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REQUIRED_FIELDS_MISSING');
    expect(response.body.error.message).toContain('patch');
  });

  it('keeps one learner out of another learner\'s submission', async () => {
    await setTriggers(NOVASHOP, 999);
    const owner = await learnerHeaders('evidence-owner');
    const stranger = await learnerHeaders('evidence-stranger');
    const started = await request(app).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', owner.Cookie);
    const submitted = await request(app)
      .post(`/api/attempts/${started.body.attemptId}/submit`)
      .set('Cookie', owner.Cookie)
      .send({ work: NOVASHOP_REQUIRED });
    expect(submitted.status).toBe(201);

    const foreign = await request(app).get(`/api/submissions/${submitted.body.evidence.id}`).set('Cookie', stranger.Cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('SUBMISSION_NOT_FOUND');

    const anonymous = await request(app).get(`/api/submissions/${submitted.body.evidence.id}`);
    expect(anonymous.status).toBe(401);
  });

  it('runs the MarketFlow analysis end to end and scores the added request', async () => {
    await setTriggers(MARKETFLOW, 0);
    const { Cookie } = await learnerHeaders('analyst');

    const started = await request(app).post(`/api/simulations/${MARKETFLOW}/start`).set('Cookie', Cookie);
    const attemptId = started.body.attemptId as string;

    const workspace = await request(app).get(`/api/attempts/${attemptId}`).set('Cookie', Cookie);
    expect(workspace.body.attempt.events.map((event: { key: string }) => event.key)).toEqual([
      'quality-note',
      'impact-request',
    ]);

    const submitted = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', Cookie)
      .send({
        work: {
          ...MARKETFLOW_ANSWERS,
          impactEstimate:
            'Restoring Chairs Pro availability alone recovers roughly 55,000 SAR per quarter: 271 monthly units at the May baseline minus 124 sold in August is about 147 lost units, which at the old 480 SAR price is about 70,000 SAR per month before the price change, so a conservative recovery at current price is 55,000.',
        },
      });
    expect(submitted.status).toBe(201);

    const evidence = submitted.body.evidence;
    expect(evidence.evaluation.rubricVersion).toBe('marketflow-decline-r1');
    expect(evidence.evaluation.score).toBe(100);
    expect(evidence.evaluation.maxScore).toBe(100);
    expect(evidence.skills.map((skill: { slug: string }) => skill.slug)).toEqual(
      expect.arrayContaining(['data-analysis', 'business-insight', 'data-storytelling']),
    );
    expect(evidence.timeline).toHaveLength(2);
  });
});
