import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { SESSION_COOKIE_NAME, createSession } from './auth/sessions.js';
import { hashPassword } from './auth/passwords.js';
import { prisma } from './db.js';
import { DEMO_MENTOR_EMAIL } from './mentor/demo-assignment.js';

/** Phase 6 — mentor review workflow, through the real HTTP app.
 *
 *  Authorization matrix under test:
 *  - anonymous → 401 on every mentor route;
 *  - signed-in learner → 403 (role gate), never a data leak;
 *  - mentor → only submissions of learners assigned to them; out-of-scope ids
 *    are 404 SUBMISSION_NOT_FOUND on reads AND writes (no existence leak);
 *  - review lifecycle: draft upsert → complete (from draft or directly),
 *    validation of feedback text, per-mentor review independence.
 *
 *  The app is created with no AI provider: mentor endpoints must never spend
 *  provider tokens, so the AI review shown in the detail payload comes from the
 *  stored cache only (a READY row inserted here; anything else reads as null). */

const runId = Date.now().toString(36);
const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000 });
// The same app with the dev/demo switch on: proves the switch - not the
// environment - is what makes a freshly registered learner reviewable.
const demoApp = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, demoAutoAssignMentor: true });

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

const REVIEW_JSON = {
  strengths: ['The diagnosis names the stale-reference mechanism correctly.'],
  areas_to_improve: ['The test plan never checks the desktop regression case.'],
  actionable_recommendations: ['Add step 4 covering desktop at 1280px.'],
  explanation: 'Overall the write-up is close, but verification coverage is thin.',
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe('mentor review workflow', () => {
  it('requires authentication on every mentor route', async () => {
    const attempts = [
      request(app).get('/api/mentor/submissions'),
      request(app).get('/api/mentor/submissions/whatever'),
      request(app).put('/api/mentor/submissions/whatever/review').send({ feedback: 'x' }),
      request(app).post('/api/mentor/submissions/whatever/review/complete').send({}),
    ];
    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects non-mentor roles with 403 before any data access', async () => {
    const learner = await createUser('gate-learner', 'LEARNER');
    const employer = await createUser('gate-employer', 'EMPLOYER');

    const list = await request(app).get('/api/mentor/submissions').set('Cookie', learner.Cookie);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');

    const draft = await request(app).put('/api/mentor/submissions/whatever/review').set('Cookie', learner.Cookie).send({ feedback: 'nope' });
    expect(draft.status).toBe(403);

    const employerComplete = await request(app)
      .post('/api/mentor/submissions/whatever/review/complete')
      .set('Cookie', employer.Cookie)
      .send({});
    expect(employerComplete.status).toBe(403);
  });

  it('scopes the queue to assigned learners only', async () => {
    const mentor = await createUser('queue-mentor', 'MENTOR');
    const assigned = await createUser('queue-assigned', 'LEARNER');
    const stranger = await createUser('queue-stranger', 'LEARNER');
    await assign(mentor.user.id, assigned.user.id);

    await submitNovaShop(assigned.Cookie);
    await submitNovaShop(stranger.Cookie);

    const queue = await request(app).get('/api/mentor/submissions').set('Cookie', mentor.Cookie);
    expect(queue.status).toBe(200);
    const submissions: { id: string; learner: { id: string }; reviewStatus: string; reviewUpdatedAt: string | null; score: { score: number; maxScore: number } }[] = queue.body.submissions;
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      learner: { id: assigned.user.id },
      reviewStatus: 'NONE',
      reviewUpdatedAt: null,
    });
    expect(submissions[0]!.score).toMatchObject({ score: 90, maxScore: 90 });
  });

  it('returns 404 SUBMISSION_NOT_FOUND for out-of-scope reads and writes', async () => {
    const mentor = await createUser('scope-mentor', 'MENTOR');
    const assigned = await createUser('scope-assigned', 'LEARNER');
    const stranger = await createUser('scope-stranger', 'LEARNER');
    await assign(mentor.user.id, assigned.user.id);
    const insideId = await submitNovaShop(assigned.Cookie);
    const outsideId = await submitNovaShop(stranger.Cookie);

    const inside = await request(app).get(`/api/mentor/submissions/${insideId}`).set('Cookie', mentor.Cookie);
    expect(inside.status).toBe(200);
    expect(inside.body.evidence.id).toBe(insideId);

    // Same shape everywhere: a guessed id is indistinguishable from a missing one.
    const outside = await request(app).get(`/api/mentor/submissions/${outsideId}`).set('Cookie', mentor.Cookie);
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('SUBMISSION_NOT_FOUND');

    const outsideDraft = await request(app).put(`/api/mentor/submissions/${outsideId}/review`).set('Cookie', mentor.Cookie).send({ feedback: 'sneaky' });
    expect(outsideDraft.status).toBe(404);
    const outsideComplete = await request(app)
      .post(`/api/mentor/submissions/${outsideId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({});
    expect(outsideComplete.status).toBe(404);
    expect(await prisma.mentorReview.count({ where: { submissionId: outsideId } })).toBe(0);
  });


  it('returns the full evidence detail with no review before the mentor writes one', async () => {
    const mentor = await createUser('detail-mentor', 'MENTOR');
    const learner = await createUser('detail-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const detail = await request(app).get(`/api/mentor/submissions/${submissionId}`).set('Cookie', mentor.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.evidence.learner.id).toBe(learner.user.id);
    expect(detail.body.evidence.task.title.length).toBeGreaterThan(0);
    expect(detail.body.evidence.work.length).toBeGreaterThan(0);
    expect(detail.body.evidence.evaluation).not.toBeNull();
    expect(detail.body.evidence.skills.length).toBeGreaterThan(0);
    expect(detail.body.review).toBeNull();
    expect(detail.body.aiReview).toBeNull();
  });

  it('saves a draft, keeps the lifecycle on further saves, and shows it in the queue', async () => {
    const mentor = await createUser('draft-mentor', 'MENTOR');
    const learner = await createUser('draft-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    const saved = await request(app)
      .put(`/api/mentor/submissions/${submissionId}/review`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: '  Strong diagnosis; add a desktop regression step.  ' });
    expect(saved.status).toBe(200);
    expect(saved.body.review).toMatchObject({ feedback: 'Strong diagnosis; add a desktop regression step.', status: 'DRAFT' });

    const queue = await request(app).get('/api/mentor/submissions').set('Cookie', mentor.Cookie);
    const item = queue.body.submissions.find((entry: { id: string }) => entry.id === submissionId);
    expect(item.reviewStatus).toBe('DRAFT');

    const detail = await request(app).get(`/api/mentor/submissions/${submissionId}`).set('Cookie', mentor.Cookie);
    expect(detail.body.review).toMatchObject({ feedback: 'Strong diagnosis; add a desktop regression step.', status: 'DRAFT' });

    // Editing a draft again stays a draft; the text is replaced, not appended.
    const revised = await request(app)
      .put(`/api/mentor/submissions/${submissionId}/review`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: 'Revised after a second read.' });
    expect(revised.body.review).toMatchObject({ feedback: 'Revised after a second read.', status: 'DRAFT' });
  });

  it('completes reviews from a draft or directly, and the queue reflects completion', async () => {
    const mentor = await createUser('complete-mentor', 'MENTOR');
    // One submission per learner (a task can only be submitted once), so the
    // draft path and the direct path need two assigned learners.
    const draftLearner = await createUser('complete-draft-learner', 'LEARNER');
    const directLearner = await createUser('complete-direct-learner', 'LEARNER');
    await assign(mentor.user.id, draftLearner.user.id);
    await assign(mentor.user.id, directLearner.user.id);
    const fromDraftId = await submitNovaShop(draftLearner.Cookie);
    const directId = await submitNovaShop(directLearner.Cookie);

    await request(app)
      .put(`/api/mentor/submissions/${fromDraftId}/review`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: 'Solid approach; watch the edge cases.' });

    // Completing without new text keeps the saved feedback.
    const completed = await request(app)
      .post(`/api/mentor/submissions/${fromDraftId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({});
    expect(completed.status).toBe(200);
    expect(completed.body.review).toMatchObject({ feedback: 'Solid approach; watch the edge cases.', status: 'COMPLETED' });

    // Completing directly (no draft) creates the review in one step.
    const direct = await request(app)
      .post(`/api/mentor/submissions/${directId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: 'Good plan; quantify the estimate next time.' });
    expect(direct.status).toBe(200);
    expect(direct.body.review).toMatchObject({ feedback: 'Good plan; quantify the estimate next time.', status: 'COMPLETED' });

    const queue = await request(app).get('/api/mentor/submissions').set('Cookie', mentor.Cookie);
    const statuses = new Map(queue.body.submissions.map((entry: { id: string; reviewStatus: string }) => [entry.id, entry.reviewStatus]));
    expect(statuses.get(fromDraftId)).toBe('COMPLETED');
    expect(statuses.get(directId)).toBe('COMPLETED');
  });


  it('validates feedback input and refuses to complete without any text', async () => {
    const mentor = await createUser('validate-mentor', 'MENTOR');
    const learner = await createUser('validate-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);
    const url = `/api/mentor/submissions/${submissionId}`;

    const emptyComplete = await request(app).post(`${url}/review/complete`).set('Cookie', mentor.Cookie).send({});
    expect(emptyComplete.status).toBe(400);
    expect(emptyComplete.body.error.code).toBe('VALIDATION_ERROR');

    const whitespace = await request(app).put(`${url}/review`).set('Cookie', mentor.Cookie).send({ feedback: '   ' });
    expect(whitespace.status).toBe(400);

    const tooLong = await request(app).put(`${url}/review`).set('Cookie', mentor.Cookie).send({ feedback: 'x'.repeat(4001) });
    expect(tooLong.status).toBe(400);

    const notText = await request(app).put(`${url}/review`).set('Cookie', mentor.Cookie).send({ feedback: 42 });
    expect(notText.status).toBe(400);

    const extraKey = await request(app).put(`${url}/review`).set('Cookie', mentor.Cookie).send({ feedback: 'ok', status: 'COMPLETED' });
    expect(extraKey.status).toBe(400);

    const whitespaceComplete = await request(app).post(`${url}/review/complete`).set('Cookie', mentor.Cookie).send({ feedback: ' \n ' });
    expect(whitespaceComplete.status).toBe(400);
    expect(await prisma.mentorReview.count({ where: { submissionId } })).toBe(0);
  });

  it('rejects completing with only whitespace, but completes a saved draft without new text', async () => {
    const mentor = await createUser('complete-text-mentor', 'MENTOR');
    const learner = await createUser('complete-text-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    await request(app).put(`/api/mentor/submissions/${submissionId}/review`).set('Cookie', mentor.Cookie).send({ feedback: 'Saved earlier.' });
    const whitespaceComplete = await request(app)
      .post(`/api/mentor/submissions/${submissionId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: '   ' });
    expect(whitespaceComplete.status).toBe(400);

    const completed = await request(app)
      .post(`/api/mentor/submissions/${submissionId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({});
    expect(completed.body.review).toMatchObject({ feedback: 'Saved earlier.', status: 'COMPLETED' });
  });

  it('surfaces the completed mentor feedback to the learner, drafts stay hidden', async () => {
    const mentor = await createUser('feedback-view-mentor', 'MENTOR');
    const learner = await createUser('feedback-view-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    // Before any review: the learner payload has no feedback at all.
    const before = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', learner.Cookie);
    expect(before.status).toBe(200);
    expect(before.body.mentorFeedback).toBeNull();

    // A draft is invisible to the learner.
    await request(app)
      .put(`/api/mentor/submissions/${submissionId}/review`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: 'Draft the learner must not see yet.' });
    const duringDraft = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', learner.Cookie);
    expect(duringDraft.body.mentorFeedback).toBeNull();

    // Completing publishes it with the reviewer's name.
    await request(app)
      .post(`/api/mentor/submissions/${submissionId}/review/complete`)
      .set('Cookie', mentor.Cookie)
      .send({ feedback: 'Strong write-up; add the desktop regression step.' });
    const after = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', learner.Cookie);
    expect(after.status).toBe(200);
    expect(after.body.mentorFeedback).toMatchObject({
      reviewerName: mentor.user.name,
      feedback: 'Strong write-up; add the desktop regression step.',
    });
    // The draft text was replaced by the completed text, never leaked alongside.
    expect(JSON.stringify(after.body)).not.toContain('must not see yet');
  });

  it('gives each mentor an independent review of the same learner', async () => {
    const mentorA = await createUser('shared-mentor-a', 'MENTOR');
    const mentorB = await createUser('shared-mentor-b', 'MENTOR');
    const learner = await createUser('shared-learner', 'LEARNER');
    await assign(mentorA.user.id, learner.user.id);
    await assign(mentorB.user.id, learner.user.id);
    const submissionId = await submitNovaShop(learner.Cookie);

    await request(app)
      .post(`/api/mentor/submissions/${submissionId}/review/complete`)
      .set('Cookie', mentorA.Cookie)
      .send({ feedback: 'Mentor A: good work.' });

    const viewForB = await request(app).get(`/api/mentor/submissions/${submissionId}`).set('Cookie', mentorB.Cookie);
    expect(viewForB.status).toBe(200);
    expect(viewForB.body.review).toBeNull();

    await request(app)
      .put(`/api/mentor/submissions/${submissionId}/review`)
      .set('Cookie', mentorB.Cookie)
      .send({ feedback: 'Mentor B: draft note.' });

    const viewForA = await request(app).get(`/api/mentor/submissions/${submissionId}`).set('Cookie', mentorA.Cookie);
    expect(viewForA.body.review).toMatchObject({ feedback: 'Mentor A: good work.', status: 'COMPLETED' });
    expect(await prisma.mentorReview.count({ where: { submissionId } })).toBe(2);
  });

  it('surfaces the cached READY AI review without ever calling the provider', async () => {
    const mentor = await createUser('ai-mentor', 'MENTOR');
    const learner = await createUser('ai-learner', 'LEARNER');
    await assign(mentor.user.id, learner.user.id);
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

    const detail = await request(app).get(`/api/mentor/submissions/${submissionId}?locale=EN`).set('Cookie', mentor.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.aiReview).toMatchObject({ status: 'READY', model: 'fake:model' });
    expect(detail.body.aiReview.feedback.explanation).toBe(REVIEW_JSON.explanation);

    // The app has no working provider configured, so a null AR result also
    // proves nothing here called the provider: stored rows are read, never made.
    const arabicDetail = await request(app).get(`/api/mentor/submissions/${submissionId}?locale=AR`).set('Cookie', mentor.Cookie);
    expect(arabicDetail.body.aiReview).toBeNull();
  });
});

/** The seeded demo mentor, created on demand so this file never depends on the
 *  seed having run. `update: {}` leaves an already-seeded row untouched. */
async function ensureDemoMentor() {
  const mentor = await prisma.user.upsert({
    where: { email: DEMO_MENTOR_EMAIL },
    update: {},
    create: { email: DEMO_MENTOR_EMAIL, name: 'Omar Mentor', passwordHash: hashPassword('Correct-Horse-1'), role: 'MENTOR', locale: 'EN' },
    select: { id: true, name: true },
  });
  const token = await createSession(mentor.id);
  return { user: mentor, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
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

describe('demo mentor auto-assignment', () => {
  it('stays off by default: a registered learner without a mentor is not reviewable', async () => {
    await ensureDemoMentor();
    const learner = await registerLearner('no-assign', app);
    const submissionId = await submitNovaShop(learner.Cookie, app);

    expect(await prisma.mentorAssignment.count({ where: { learnerId: learner.user.id } })).toBe(0);

    const demoMentor = await ensureDemoMentor();
    const queue = await request(app).get('/api/mentor/submissions').set('Cookie', demoMentor.Cookie);
    expect(queue.status).toBe(200);
    const ids = queue.body.submissions.map((entry: { id: string }) => entry.id);
    expect(ids).not.toContain(submissionId);
  });

  it('assigns a mentor-less learner to the demo mentor on submission when enabled', async () => {
    const demoMentor = await ensureDemoMentor();
    const learner = await registerLearner('auto-assign', demoApp);
    const submissionId = await submitNovaShop(learner.Cookie, demoApp);

    const queue = await request(demoApp).get('/api/mentor/submissions').set('Cookie', demoMentor.Cookie);
    expect(queue.status).toBe(200);
    const item = queue.body.submissions.find((entry: { id: string }) => entry.id === submissionId);
    expect(item).toMatchObject({
      learner: { id: learner.user.id, name: learner.user.name },
      reviewStatus: 'NONE',
    });
  });

  it('never replaces a mentor an admin already provisioned', async () => {
    const demoMentor = await ensureDemoMentor();
    const otherMentor = await createUser('pre-assigned-mentor', 'MENTOR');
    const learner = await registerLearner('pre-assigned', demoApp);
    await assign(otherMentor.user.id, learner.user.id);

    await submitNovaShop(learner.Cookie, demoApp);

    const assignments = await prisma.mentorAssignment.findMany({ where: { learnerId: learner.user.id } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.mentorId).toBe(otherMentor.user.id);
    expect(assignments[0]!.mentorId).not.toBe(demoMentor.user.id);
  });
});

