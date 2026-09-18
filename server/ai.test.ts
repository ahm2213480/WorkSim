import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { AiUnavailableError, type AiProvider } from './ai/provider.js';
import { SESSION_COOKIE_NAME, createSession } from './auth/sessions.js';
import { hashPassword } from './auth/passwords.js';
import { prisma } from './db.js';

/** AI feature tests run against the real HTTP app with an injected fake
 *  provider. No external AI service is contacted; failure paths (provider
 *  error, timeout, malformed output) are produced by the fake itself.
 *
 *  The critical invariant asserted throughout: AI success OR failure never
 *  changes the deterministic evaluation, submission state, or evidence. */

const runId = Date.now().toString(36);

const VALID_REVIEW = {
  strengths: ['The diagnosis names the stale-reference mechanism correctly.'],
  areas_to_improve: ['The test plan never checks the desktop regression case.'],
  actionable_recommendations: ['Add step 4 covering desktop at 1280px.'],
  explanation: 'Overall the write-up is close, but verification coverage is thin.',
};
const VALID_COACH = {
  demonstrated_strengths: ['Debugging evidence from the NovaShop submission.'],
  skills_to_improve: ['Test planning coverage.'],
  recommended_next_skills: ['Responsive design verification.'],
  recommended_next_simulation: 'marketflow-sales-decline',
  reasoning: 'The evidence shows debugging strength; analysis breadth is the next gap.',
};

function fakeProvider(overrides: Partial<Pick<AiProvider, 'complete'>> = {}): AiProvider & { calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    describe: () => 'fake:model',
    async complete(system: string, user: string, maxOutputChars: number) {
      calls.push({ system, user });
      if (overrides.complete) return overrides.complete(system, user, maxOutputChars);
      return { content: JSON.stringify(VALID_REVIEW), model: 'fake:model' };
    },
  };
}

/** The prompt the fake recorded first, or '' when the provider was never
 *  called — keeps prompt assertions free of index-undefined noise. */
function firstPrompt(provider: { calls: { user: string }[] }): string {
  return provider.calls[0]?.user ?? '';
}

async function newLearner(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${runId}@test.dev`,
      name: `Learner ${label}`,
      passwordHash: hashPassword('Correct-Horse-1'),
      role: 'LEARNER',
      locale: 'EN',
    },
  });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${await createSession(user.id)}` };
}

/** Starts the NovaShop simulation and submits a complete, high-scoring answer,
 *  returning the submission id. */
async function submitNovaShop(cookieValue: string) {
  const started = await request(app).post('/api/simulations/novashop-mobile-checkout/start').set('Cookie', cookieValue);
  const attemptId = started.body.attemptId as string;
  const submitted = await request(app)
    .post(`/api/attempts/${attemptId}/submit`)
    .set('Cookie', cookieValue)
    .send({
      work: {
        diagnosis: 'The effect only depends on cart.items.length, so the first render keeps a stale total; the mobile sheet mounts before the cart resolves.',
        patch: 'useEffect(..., [cart]); handlePay guards !order and formatMoney(0).',
        testPlan: 'quantity +/- as guest, plus desktop regression check',
        estimate: '4 hours',
      },
    });
  expect(submitted.status).toBe(201);
  return submitted.body.evidence.id as string;
}

/** Completes the MarketFlow simulation with a full, per-criterion answer — the
 *  second completed datapoint the coach needs before it will say anything. */
async function submitMarketFlow(cookieValue: string) {
  const started = await request(app).post('/api/simulations/marketflow-sales-decline/start').set('Cookie', cookieValue);
  const attemptId = started.body.attemptId as string;
  const submitted = await request(app)
    .post(`/api/attempts/${attemptId}/submit`)
    .set('Cookie', cookieValue)
    .send({
      work: {
        findings: 'July and August are where the trend broke: North revenue fell from 480k in June to 372k in July and 341k in August.',
        drivers: 'Returns on sku-1140 tripled in July, while a competitor cut its price to 480 and we held 620, so two drivers overlap.',
        limitations: 'The October extract is partial and not reconciled, so the final month is incomplete and understates the decline.',
        recommendation: 'Pause the sku-1140 promotion and ship the quality fix first, then run a targeted price test in the North instead of a blanket discount, because returns rather than demand drove most of the loss.',
        impactEstimate: 'Fixing the return driver is worth roughly 96k per quarter at current volume.',
      },
    });
  expect(submitted.status).toBe(201);
  return submitted.body.evidence.id as string;
}

const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: fakeProvider() });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AI submission reviewer', () => {
  it('stores and serves a valid structured review, and caches it without calling the provider again', async () => {
    const { cookie: learner } = await newLearner('review-ok');
    const submissionId = await submitNovaShop(learner);
    const provider = fakeProvider();
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });
    // Snapshot the deterministic result before AI runs, so the test proves the
    // AI call changed nothing rather than hard-coding rubric weights.
    const baseline = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', learner);

    const first = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(first.status).toBe(200);
    expect(first.body.review).toMatchObject({ status: 'READY' });
    expect(first.body.review.feedback.strengths).toHaveLength(1);
    expect(provider.calls).toHaveLength(1);
    // The prompt carried the learner's own work context and nothing about the
    // account that produced it: no email, no user id, no other learners.
    const reviewPrompt = firstPrompt(provider);
    expect(reviewPrompt).toContain('Root-cause write-up');
    expect(reviewPrompt).toContain('NovaShop');
    expect(reviewPrompt).not.toContain('review-ok');

    const again = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(again.status).toBe(200);
    expect(again.body.review.status).toBe('READY');
    expect(provider.calls).toHaveLength(1); // cache hit: no second provider call

    // Reads never call the provider at all.
    const read = await request(scoped).get(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(read.status).toBe(200);
    expect(read.body.review.feedback.explanation).toContain('write-up');
    expect(provider.calls).toHaveLength(1);

    // The deterministic evaluation is identical to the pre-AI snapshot.
    const evidence = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', learner);
    expect(evidence.body.evidence.evaluation).toEqual(baseline.body.evidence.evaluation);
  });

  it('accepts a markdown-fenced AI answer instead of discarding correct feedback', async () => {
    const { cookie } = await newLearner('review-fenced');
    const submissionId = await submitNovaShop(cookie);
    // Observed real behaviour: Gemini returns correct feedback wrapped in
    // ```json ... ```. That must still count as valid feedback.
    const provider = fakeProvider({
      complete: async () => ({ content: `\`\`\`json\n${JSON.stringify(VALID_REVIEW)}\n\`\`\``, model: 'fake:model' }),
    });

    const response = await request(createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider }))
      .post(`/api/submissions/${submissionId}/ai-review`)
      .set('Cookie', cookie);

    expect(response.body.review.status).toBe('READY');
    expect(response.body.review.feedback).toEqual(VALID_REVIEW);
  });

  it('rejects an answer that is well-formed JSON but not the agreed shape', async () => {
    const { cookie } = await newLearner('review-wrong-shape');
    const submissionId = await submitNovaShop(cookie);
    // The model invents its own scoring field: structurally valid, contractually
    // wrong, so it must not be stored as feedback.
    const provider = fakeProvider({ complete: async () => ({ content: '{"score": 95, "verdict": "good job"}', model: 'fake:model' }) });

    const response = await request(createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider }))
      .post(`/api/submissions/${submissionId}/ai-review`)
      .set('Cookie', cookie);

    expect(response.body.review).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE' });
    const stored = await prisma.aIFeedback.findUnique({ where: { submissionId_locale: { submissionId, locale: 'EN' } } });
    expect(stored?.status).toBe('UNAVAILABLE');
    expect(stored?.feedbackJson).toBeNull();
    expect(stored?.submissionId).toBe(submissionId);
  });

  it('records UNAVAILABLE on provider failure and keeps the submission fully intact', async () => {
    const { cookie: learner } = await newLearner('review-fail');
    const submissionId = await submitNovaShop(learner);
    const baseline = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', learner);
    const provider = fakeProvider({
      complete: async () => { throw new AiUnavailableError('AI_PROVIDER_ERROR', 'down'); },
    });
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });

    const failed = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(failed.status).toBe(200); // the request itself succeeds; the review is unavailable
    expect(failed.body.review).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_PROVIDER_ERROR', feedback: null });

    // Submission + deterministic evaluation remain untouched and readable: the
    // score after the AI failure is identical to the snapshot taken before it.
    const evidence = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', learner);
    expect(evidence.status).toBe(200);
    expect(evidence.body.evidence.evaluation).toEqual(baseline.body.evidence.evaluation);
    expect(evidence.body.evidence.evaluation.score).toBeGreaterThan(0);

    // A retry after a failure is allowed and succeeds.
    const retryProvider = fakeProvider();
    const retry = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: retryProvider });
    const retried = await request(retry).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(retried.body.review.status).toBe('READY');
  });

  it('treats malformed AI output as unavailable, never as feedback', async () => {
    const { cookie: learner } = await newLearner('review-bad');
    const submissionId = await submitNovaShop(learner);
    const provider = fakeProvider({
      complete: async () => ({ content: 'sorry, I cannot help with that', model: 'fake:model' }),
    });
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });

    const response = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(response.body.review).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE' });
    // Nothing invalid was persisted as READY.
    const stored = await prisma.aIFeedback.findUnique({ where: { submissionId_locale: { submissionId, locale: 'EN' } } });
    expect(stored?.status).toBe('UNAVAILABLE');
  });
  it('records a timeout as retryable, and the submission needs no rework', async () => {
    const { cookie: learner } = await newLearner('review-timeout');
    const submissionId = await submitNovaShop(learner);
    const baseline = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', learner);
    const provider = fakeProvider({
      complete: async () => { throw new AiUnavailableError('AI_TIMEOUT', 'the provider did not answer'); },
    });
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });

    const timedOut = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(timedOut.body.review).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_TIMEOUT' });

    // Work evidence is unchanged: a provider timeout is not the learner's problem.
    const evidence = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', learner);
    expect(evidence.body.evidence.evaluation).toEqual(baseline.body.evidence.evaluation);

    // Retrying later works without redoing the simulation.
    const retried = await request(createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: fakeProvider() }))
      .post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(retried.body.review.status).toBe('READY');
  });

  it('rate-limits repeated generation so a single learner cannot run up the AI bill', async () => {
    const { cookie: learner } = await newLearner('review-limit');
    const submissionId = await submitNovaShop(learner);
    const provider = fakeProvider({
      complete: async () => { throw new AiUnavailableError('AI_PROVIDER_ERROR', 'down'); },
    });
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });

    // Failures are retryable, which is exactly why a limiter is needed: without
    // it a frustrated learner could loop the endpoint indefinitely.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
      expect(response.status).toBe(200);
    }
    const limited = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('AI_RATE_LIMITED');
    expect(provider.calls).toHaveLength(5);

    // Reads are never limited and never generate.
    const read = await request(scoped).get(`/api/submissions/${submissionId}/ai-review`).set('Cookie', learner);
    expect(read.status).toBe(200);
    expect(provider.calls).toHaveLength(5);
  });



  it('keeps another learner out of a foreign AI review, with no existence leak', async () => {
    const owner = await newLearner('ai-owner');
    const stranger = await newLearner('ai-stranger');
    const submissionId = await submitNovaShop(owner.cookie);
    const provider = fakeProvider();
    const scoped = createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });

    const foreign = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`).set('Cookie', stranger.cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('SUBMISSION_NOT_FOUND');
    const foreignRead = await request(scoped).get(`/api/submissions/${submissionId}/ai-review`).set('Cookie', stranger.cookie);
    expect(foreignRead.status).toBe(404);
    const anonymous = await request(scoped).post(`/api/submissions/${submissionId}/ai-review`);
    expect(anonymous.status).toBe(401);
    expect(provider.calls).toHaveLength(0); // no generation happened for the stranger
  });
});

/** The coach's fake returns the coach contract; the default `fakeProvider`
 *  returns the reviewer contract, which `coachSchema` would (correctly) reject. */
function coachProvider(overrides: Partial<Pick<AiProvider, 'complete'>> = {}) {
  return fakeProvider({
    complete: async () => ({ content: JSON.stringify(VALID_COACH), model: 'fake:model' }),
    ...overrides,
  });
}

function coachApp(provider: AiProvider) {
  return createApp({ cookieSecure: false, rateLimitPerWindow: 1000, aiProvider: provider });
}

describe('AI career/skill coach', () => {
  it('coaches from accumulated evidence, then serves the stored report without spending tokens', async () => {
    const { cookie } = await newLearner('coach-ok');
    await submitNovaShop(cookie);
    await submitMarketFlow(cookie);
    const provider = coachProvider();
    const scoped = coachApp(provider);

    const generated = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(generated.status).toBe(200);
    expect(generated.body.report).toMatchObject({ status: 'READY' });
    expect(generated.body.report.feedback.recommended_next_simulation).toBe('marketflow-sales-decline');
    expect(provider.calls).toHaveLength(1);

    // The prompt was assembled from this learner's completed work only.
    const coachPrompt = firstPrompt(provider);
    expect(coachPrompt).toContain('NovaShop');
    expect(coachPrompt).toContain('MarketFlow');
    expect(coachPrompt).not.toContain('coach-ok');

    // Reading the dashboard section is free, and identical evidence is cached.
    const read = await request(scoped).get('/api/coach').set('Cookie', cookie);
    expect(read.body.report.status).toBe('READY');
    expect(read.body.report.feedback.reasoning).toContain('debugging strength');
    expect(provider.calls).toHaveLength(1);

    const again = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(again.body.report.status).toBe('READY');
    expect(provider.calls).toHaveLength(1); // cache hit: no second provider call
  });

  it('says "not enough evidence yet" instead of inventing trends, and never calls the provider', async () => {
    const { cookie } = await newLearner('coach-thin');
    const provider = coachProvider();
    const scoped = coachApp(provider);

    const empty = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.report).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', completedCount: 0 });

    // One finished simulation is still a single datapoint, not a trend.
    await submitNovaShop(cookie);
    const one = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(one.body.report).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', completedCount: 1 });
    expect(provider.calls).toHaveLength(0);

    // Nothing was persisted, so the read path reports "no report yet".
    const read = await request(scoped).get('/api/coach').set('Cookie', cookie);
    expect(read.body.report).toBeNull();
    expect(provider.calls).toHaveLength(0);
  });

  it('rejects a recommendation for a simulation that does not exist', async () => {
    const { user, cookie } = await newLearner('coach-fake-slug');
    await submitNovaShop(cookie);
    await submitMarketFlow(cookie);
    const provider = coachProvider({
      complete: async () => ({
        content: JSON.stringify({ ...VALID_COACH, recommended_next_simulation: 'invented-simulation' }),
        model: 'fake:model',
      }),
    });

    const response = await request(coachApp(provider)).post('/api/coach/generate').set('Cookie', cookie);
    expect(response.body.report).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE' });
    expect((await prisma.coachReport.findUnique({ where: { userId: user.id } }))?.status).toBe('UNAVAILABLE');
  });

  it('treats malformed AI output as unavailable, never as a report', async () => {
    const { user, cookie } = await newLearner('coach-bad');
    const submissionId = await submitNovaShop(cookie);
    await submitMarketFlow(cookie);
    const provider = coachProvider({ complete: async () => ({ content: 'I cannot help with that.', model: 'fake:model' }) });
    const scoped = coachApp(provider);

    const response = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(response.body.report).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_INVALID_RESPONSE' });
    expect((await prisma.coachReport.findUnique({ where: { userId: user.id } }))?.status).toBe('UNAVAILABLE');

    // The learner's own work and its objective result are still fully readable.
    const evidence = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', cookie);
    expect(evidence.status).toBe(200);
    expect(evidence.body.evidence.evaluation.score).toBeGreaterThan(0);
  });

  it('records UNAVAILABLE when the provider fails, without touching recorded work', async () => {
    const { user, cookie } = await newLearner('coach-fail');
    const submissionId = await submitNovaShop(cookie);
    await submitMarketFlow(cookie);
    const provider = coachProvider({
      complete: async () => { throw new AiUnavailableError('AI_TIMEOUT', 'the provider did not answer'); },
    });
    const scoped = coachApp(provider);

    const response = await request(scoped).post('/api/coach/generate').set('Cookie', cookie);
    expect(response.status).toBe(200); // the request succeeds; the report is unavailable
    expect(response.body.report).toMatchObject({ status: 'UNAVAILABLE', failureCode: 'AI_TIMEOUT' });
    expect((await prisma.coachReport.findUnique({ where: { userId: user.id } }))?.status).toBe('UNAVAILABLE');

    const evidence = await request(scoped).get(`/api/submissions/${submissionId}`).set('Cookie', cookie);
    expect(evidence.status).toBe(200);
    expect(evidence.body.evidence.evaluation.score).toBeGreaterThan(0);

    // A retry once the provider recovers is allowed — the learner never has to
    // redo the simulation because AI failed.
    const retried = await request(coachApp(coachProvider())).post('/api/coach/generate').set('Cookie', cookie);
    expect(retried.body.report.status).toBe('READY');
  });

  it('keeps coaching private to the learner it belongs to', async () => {
    const owner = await newLearner('coach-owner');
    const stranger = await newLearner('coach-stranger');
    await submitNovaShop(owner.cookie);
    await submitMarketFlow(owner.cookie);
    const provider = coachProvider();
    const scoped = coachApp(provider);

    const generated = await request(scoped).post('/api/coach/generate').set('Cookie', owner.cookie);
    expect(generated.body.report.status).toBe('READY');
    expect(provider.calls).toHaveLength(1);

    // The stranger gets no report and no borrowed evidence.
    const foreignRead = await request(scoped).get('/api/coach').set('Cookie', stranger.cookie);
    expect(foreignRead.body.report).toBeNull();
    const foreignGenerate = await request(scoped).post('/api/coach/generate').set('Cookie', stranger.cookie);
    expect(foreignGenerate.body.report).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', completedCount: 0 });

    // Anonymous callers are rejected, and nothing was generated for them.
    expect((await request(scoped).get('/api/coach')).status).toBe(401);
    expect((await request(scoped).post('/api/coach/generate')).status).toBe(401);
    expect(provider.calls).toHaveLength(1);
  });

  it('never calls the provider for deterministic operations', async () => {
    const { cookie } = await newLearner('coach-noai');
    const provider = coachProvider();
    const scoped = coachApp(provider);

    await request(scoped).get('/api/simulations').set('Cookie', cookie);
    const started = await request(scoped).post('/api/simulations/novashop-mobile-checkout/start').set('Cookie', cookie);
    const attemptId = started.body.attemptId as string;
    await request(scoped).patch(`/api/attempts/${attemptId}`).set('Cookie', cookie).send({ draft: { diagnosis: 'draft in progress' } });
    const submitted = await request(scoped)
      .post(`/api/attempts/${attemptId}/submit`)
      .set('Cookie', cookie)
      .send({ work: { diagnosis: 'a', patch: 'b', testPlan: 'c', estimate: '3h' } });
    await request(scoped).get(`/api/submissions/${submitted.body.evidence.id}`).set('Cookie', cookie);
    await request(scoped).get('/api/attempts').set('Cookie', cookie);

    expect(provider.calls).toHaveLength(0);
  });
});
