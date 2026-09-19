import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { SESSION_COOKIE_NAME, createSession } from './auth/sessions.js';
import { hashPassword } from './auth/passwords.js';
import { prisma } from './db.js';
import { DEMO_EMPLOYER_EMAIL } from './employer/demo-share.js';

/** Phase 7 — employer work-evidence workflow, through the real HTTP app.
 *
 *  Authorization matrix under test:
 *  - anonymous → 401 on every employer route;
 *  - learner/mentor → 403 (role gate), never a data leak;
 *  - employer → only submissions of learners whose EvidenceShare grant is
 *    active; unconsented, revoked or unknown ids are 404
 *    SUBMISSION_NOT_FOUND (no existence leak, no IDOR);
 *  - read-only surface: write verbs have no route and fall through to 404;
 *  - payload safety: no password hashes, session tokens or learner emails;
 *  - AI boundary: the cached READY review is shown per locale, an
 *    UNAVAILABLE/missing row reads as null, and nothing here calls a provider
 *    (the app is created with no AI provider at all);
 *  - mentor feedback: completed reviews are visible, drafts are not. */

const runId = Date.now().toString(36);
const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000 });
// The same app with the dev/demo switches on: proves the switches — not the
// environment — are what make a freshly registered learner visible to staff.
const demoApp = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, demoAutoShareEvidence: true });

const NOVASHOP = 'novashop-mobile-checkout';
// Same required answers learner-flow uses; with authored event triggers the
// guest-plan event has not arrived, so these four fields submit cleanly.
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

const REVIEW_JSON = {
  strengths: ['The diagnosis names the stale-reference mechanism correctly.'],
  areas_to_improve: ['The test plan never checks the desktop regression case.'],
  actionable_recommendations: ['Add step 4 covering desktop at 1280px.'],
  explanation: 'Overall the write-up is close, but verification coverage is thin.',
};

async function createUser(label: string, role: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${runId}@test.dev`,
      name: `${role.charAt(0)}${role.slice(1).toLowerCase()} ${label}`,
      passwordHash: hashPassword('Correct-Horse-1'),
      role,
      locale: 'EN',
    },
  });
  const token = await createSession(user.id);
  return { user, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function assign(mentorId: string, learnerId: string) {
  await prisma.mentorAssignment.create({ data: { mentorId, learnerId } });
}

async function share(learnerId: string, employerId: string) {
  await prisma.evidenceShare.create({ data: { learnerId, employerId } });
}

/** Runs the NovaShop task end to end for one learner and returns the submission id. */
async function submitNovaShop(cookie: string, target: ReturnType<typeof createApp> = app): Promise<string> {
  const started = await request(target).post(`/api/simulations/${NOVASHOP}/start`).set('Cookie', cookie);
  expect(started.status).toBe(201);
  const submitted = await request(target)
    .post(`/api/attempts/${started.body.attemptId as string}/submit`)
    .set('Cookie', cookie)
    .send({ work: NOVASHOP_REQUIRED });
  expect(submitted.status).toBe(201);
  return submitted.body.evidence.id as string;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('employer evidence workflow', () => {
  it('requires authentication on every employer route', async () => {
    const list = await request(app).get('/api/employer/evidence');
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe('UNAUTHENTICATED');

    const detail = await request(app).get('/api/employer/evidence/whatever');
    expect(detail.status).toBe(401);
    expect(detail.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects non-employer roles with 403 before any data access', async () => {
    const learner = await createUser('gate-learner', 'LEARNER');
    const mentor = await createUser('gate-mentor', 'MENTOR');

    const learnerList = await request(app).get('/api/employer/evidence').set('Cookie', learner.Cookie);
    expect(learnerList.status).toBe(403);
    expect(learnerList.body.error.code).toBe('FORBIDDEN');

    const mentorDetail = await request(app).get('/api/employer/evidence/whatever').set('Cookie', mentor.Cookie);
    expect(mentorDetail.status).toBe(403);
    expect(mentorDetail.body.error.code).toBe('FORBIDDEN');
  });

  it('lists only evidence of learners who granted consent', async () => {
    const employer = await createUser('list-employer', 'EMPLOYER');
    const shared = await createUser('list-shared', 'LEARNER');
    const stranger = await createUser('list-stranger', 'LEARNER');
    await share(shared.user.id, employer.user.id);

    const sharedId = await submitNovaShop(shared.Cookie);
    await submitNovaShop(stranger.Cookie);

    const list = await request(app).get('/api/employer/evidence').set('Cookie', employer.Cookie);
    expect(list.status).toBe(200);
    const submissions: { id: string; learner: { id: string }; score: { score: number; maxScore: number }; skills: string[]; mentorReview: string }[] = list.body.submissions;
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      id: sharedId,
      learner: { id: shared.user.id },
      mentorReview: 'PENDING',
    });
    expect(submissions[0]!.score).toMatchObject({ score: 90, maxScore: 90 });
    expect(submissions[0]!.skills.length).toBeGreaterThan(0);
  });

  it('returns 404 SUBMISSION_NOT_FOUND for unconsented and unknown submissions', async () => {
    const employer = await createUser('scope-employer', 'EMPLOYER');
    const stranger = await createUser('scope-stranger', 'LEARNER');
    const outsideId = await submitNovaShop(stranger.Cookie);

    const outside = await request(app).get(`/api/employer/evidence/${outsideId}`).set('Cookie', employer.Cookie);
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('SUBMISSION_NOT_FOUND');

    // A guessed id is indistinguishable from a missing one.
    const unknown = await request(app).get('/api/employer/evidence/nonexistent-id').set('Cookie', employer.Cookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('SUBMISSION_NOT_FOUND');
  });

  it('hides revoked grants immediately', async () => {
    const employer = await createUser('revoke-employer', 'EMPLOYER');
    const learner = await createUser('revoke-learner', 'LEARNER');
    await share(learner.user.id, employer.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const before = await request(app).get('/api/employer/evidence').set('Cookie', employer.Cookie);
    expect(before.body.submissions).toHaveLength(1);

    await prisma.evidenceShare.update({
      where: { learnerId_employerId: { learnerId: learner.user.id, employerId: employer.user.id } },
      data: { revokedAt: new Date() },
    });

    const after = await request(app).get('/api/employer/evidence').set('Cookie', employer.Cookie);
    expect(after.status).toBe(200);
    expect(after.body.submissions).toHaveLength(0);

    const detail = await request(app).get(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie);
    expect(detail.status).toBe(404);
  });
  // MARKER2
  it('returns the full read-only evidence detail for a consented submission', async () => {
    const employer = await createUser('detail-employer', 'EMPLOYER');
    const learner = await createUser('detail-learner', 'LEARNER');
    await share(learner.user.id, employer.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const detail = await request(app).get(`/api/employer/evidence/${submissionId}?locale=EN`).set('Cookie', employer.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.evidence.learner.id).toBe(learner.user.id);
    expect(detail.body.evidence.task.title.length).toBeGreaterThan(0);
    expect(detail.body.evidence.task.instructions.length).toBeGreaterThan(0);
    expect(detail.body.evidence.work.length).toBeGreaterThan(0);
    expect(detail.body.evidence.evaluation).not.toBeNull();
    expect(detail.body.evidence.evaluation.score).toBe(90);
    expect(detail.body.evidence.skills.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.body.evidence.timeline)).toBe(true);
    // No mentor review and no stored AI feedback yet: neutral states, not errors.
    expect(detail.body.review).toBeNull();
    expect(detail.body.aiReview).toBeNull();
  });

  it('shows a completed mentor review but never a draft', async () => {
    const employer = await createUser('feedback-employer', 'EMPLOYER');
    const learner = await createUser('feedback-learner', 'LEARNER');
    const mentorA = await createUser('feedback-mentor-a', 'MENTOR');
    const mentorB = await createUser('feedback-mentor-b', 'MENTOR');
    await share(learner.user.id, employer.user.id);
    await assign(mentorA.user.id, learner.user.id);
    await assign(mentorB.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    await request(app)
      .post(`/api/mentor/submissions/${submissionId}/review/complete`)
      .set('Cookie', mentorA.Cookie)
      .send({ feedback: 'Completed: solid diagnosis, add the desktop regression.' });
    await request(app)
      .put(`/api/mentor/submissions/${submissionId}/review`)
      .set('Cookie', mentorB.Cookie)
      .send({ feedback: 'Draft notes that employers must never see.' });

    const list = await request(app).get('/api/employer/evidence').set('Cookie', employer.Cookie);
    expect(list.body.submissions[0].mentorReview).toBe('COMPLETED');

    const detail = await request(app).get(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.review).toMatchObject({ feedback: 'Completed: solid diagnosis, add the desktop regression.' });
    expect(JSON.stringify(detail.body.review)).not.toContain('employers must never see');
  });
  it('surfaces the cached READY AI review without ever calling the provider', async () => {
    const employer = await createUser('ai-employer', 'EMPLOYER');
    const learner = await createUser('ai-learner', 'LEARNER');
    await share(learner.user.id, employer.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    // READY row for EN (shown) and an UNAVAILABLE row for AR (never shown as feedback).
    await prisma.aIFeedback.create({
      data: {
        submissionId,
        locale: 'EN',
        status: 'READY',
        inputHash: 'test-hash',
        promptVersion: 'review-v1',
        model: 'fake:model',
        feedbackJson: JSON.stringify(REVIEW_JSON),
        completedAt: new Date(),
      },
    });
    await prisma.aIFeedback.create({
      data: { submissionId, locale: 'AR', status: 'UNAVAILABLE', inputHash: 'test-hash', promptVersion: 'review-v1', failureCode: 'AI_PROVIDER_ERROR' },
    });

    const detail = await request(app).get(`/api/employer/evidence/${submissionId}?locale=EN`).set('Cookie', employer.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.aiReview).toMatchObject({ status: 'READY', model: 'fake:model' });
    expect(detail.body.aiReview.feedback.explanation).toBe(REVIEW_JSON.explanation);

    // The app has no working provider configured, so a null AR result also
    // proves nothing here called the provider: stored rows are read, never made.
    const arabicDetail = await request(app).get(`/api/employer/evidence/${submissionId}?locale=AR`).set('Cookie', employer.Cookie);
    expect(arabicDetail.body.aiReview).toBeNull();
  });

  it('never returns secrets, tokens or private account fields', async () => {
    const employer = await createUser('safe-employer', 'EMPLOYER');
    const learner = await createUser('safe-learner', 'LEARNER');
    await share(learner.user.id, employer.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const list = await request(app).get('/api/employer/evidence').set('Cookie', employer.Cookie);
    const detail = await request(app).get(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie);
    for (const response of [list, detail]) {
      expect(response.status).toBe(200);
      const payload = JSON.stringify(response.body).toLowerCase();
      expect(payload).not.toContain('passwordhash');
      expect(payload).not.toContain('tokenhash');
      expect(payload).not.toContain('@test.dev');
    }
    // The learner is identified by name and opaque id only — no email.
    expect(detail.body.evidence.learner).toEqual({ id: learner.user.id, name: expect.any(String) });
    expect(detail.body.evidence.learner.email).toBeUndefined();
  });

  it('offers no write access — mutation verbs fall through to the API 404', async () => {
    const employer = await createUser('readonly-employer', 'EMPLOYER');
    const learner = await createUser('readonly-learner', 'LEARNER');
    await share(learner.user.id, employer.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const attempts = [
      request(app).post('/api/employer/evidence').set('Cookie', employer.Cookie).send({}),
      request(app).post(`/api/employer/evidence/${submissionId}/review`).set('Cookie', employer.Cookie).send({ feedback: 'nope' }),
      request(app).put(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie).send({ score: 0 }),
      request(app).patch(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie).send({ score: 0 }),
      request(app).delete(`/api/employer/evidence/${submissionId}`).set('Cookie', employer.Cookie),
    ];
    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }

    // Nothing changed on the submission.
    const evaluation = await prisma.evaluation.findFirst({ where: { submissionId } });
    expect(evaluation?.score).toBe(90);
    expect(await prisma.mentorReview.count({ where: { submissionId } })).toBe(0);
  });
});

/** The seeded demo employer, created on demand so this file never depends on
 *  the seed having run. `update: {}` leaves an already-seeded row untouched. */
async function ensureDemoEmployer() {
  const employer = await prisma.user.upsert({
    where: { email: DEMO_EMPLOYER_EMAIL },
    update: {},
    create: { email: DEMO_EMPLOYER_EMAIL, name: 'Elena Employer', passwordHash: hashPassword('Correct-Horse-1'), role: 'EMPLOYER', locale: 'EN' },
    select: { id: true, name: true },
  });
  const token = await createSession(employer.id);
  return { user: employer, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

/** Registers through the public endpoint, so the account is a real LEARNER
 *  created exactly the way the UI creates one. */
async function registerLearner(label: string, target: ReturnType<typeof createApp>) {
  const email = `${label}-${runId}@test.dev`;
  const response = await request(target)
    .post('/api/auth/register')
    .send({ name: `Learner ${label}`, email, password: 'Correct-Horse-1', locale: 'EN' });
  expect(response.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await createSession(user.id);
  return { user, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

describe('demo evidence auto-share', () => {
  it('stays off by default: a registered learner without a grant is invisible to the employer', async () => {
    await ensureDemoEmployer();
    const learner = await registerLearner('no-share', app);
    const submissionId = await submitNovaShop(learner.Cookie, app);

    expect(await prisma.evidenceShare.count({ where: { learnerId: learner.user.id } })).toBe(0);

    const demoEmployer = await ensureDemoEmployer();
    const list = await request(app).get('/api/employer/evidence').set('Cookie', demoEmployer.Cookie);
    expect(list.status).toBe(200);
    const ids = list.body.submissions.map((entry: { id: string }) => entry.id);
    expect(ids).not.toContain(submissionId);
  });

  it('shares a grant-less learner with the demo employer on submission when enabled', async () => {
    const demoEmployer = await ensureDemoEmployer();
    const learner = await registerLearner('auto-share', demoApp);
    const submissionId = await submitNovaShop(learner.Cookie, demoApp);

    const list = await request(demoApp).get('/api/employer/evidence').set('Cookie', demoEmployer.Cookie);
    expect(list.status).toBe(200);
    const item = list.body.submissions.find((entry: { id: string }) => entry.id === submissionId);
    expect(item).toMatchObject({
      learner: { id: learner.user.id, name: learner.user.name },
      mentorReview: 'PENDING',
    });
  });

  it('never re-subscribes a learner who revoked the demo grant', async () => {
    const demoEmployer = await ensureDemoEmployer();
    const learner = await registerLearner('revoked-share', demoApp);
    await share(learner.user.id, demoEmployer.user.id);
    await prisma.evidenceShare.update({
      where: { learnerId_employerId: { learnerId: learner.user.id, employerId: demoEmployer.user.id } },
      data: { revokedAt: new Date() },
    });

    const submissionId = await submitNovaShop(learner.Cookie, demoApp);

    // The revoked grant is preserved: submitting again must not undo the
    // learner's explicit revocation.
    const grant = await prisma.evidenceShare.findUniqueOrThrow({
      where: { learnerId_employerId: { learnerId: learner.user.id, employerId: demoEmployer.user.id } },
    });
    expect(grant.revokedAt).not.toBeNull();

    const list = await request(demoApp).get('/api/employer/evidence').set('Cookie', demoEmployer.Cookie);
    const ids = list.body.submissions.map((entry: { id: string }) => entry.id);
    expect(ids).not.toContain(submissionId);
  });
});
