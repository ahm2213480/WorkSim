import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http-error.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import type { AiProvider } from './provider.js';
import { coachLearner, readStoredCoachReport } from './coach.js';
import { readStoredReview, reviewSubmission } from './reviewer.js';
import { loadOwnedSubmission } from '../submissions/service.js';

/** How often one user may start an AI generation. The limiter exists for cost
 *  control, not security: generation is also naturally bounded by the
 *  READY-cache (a review for an immutable submission never re-calls the
 *  provider). Window is generous for normal use, tight enough to stop loops. */
const GENERATION_LIMIT = 5;
const GENERATION_WINDOW_MS = 60 * 60 * 1000;

function tooManyRequests(): HttpError {
  return new HttpError(429, 'AI_RATE_LIMITED', 'Too many AI requests. Please try again later.');
}

/** Server-side AI endpoints. Each route requires auth individually (a blanket
 *  router-level guard would also intercept unmatched paths and turn every API
 *  404 into a 401). All routes act strictly on `req.user.id` or on a submission
 *  whose ownership is re-checked inside the service, so a learner can never
 *  request another user's feedback or context. The provider is injected (real
 *  in production, fake in tests); the key never leaves here. */
export function aiRouter(provider: AiProvider) {
  const router = Router();
  const hits = new Map<string, number[]>();

  function checkRate(userId: string, scope: string) {
    const now = Date.now();
    const key = `${userId}:${scope}`;
    const recent = (hits.get(key) ?? []).filter((time) => now - time < GENERATION_WINDOW_MS);
    if (recent.length >= GENERATION_LIMIT) throw tooManyRequests();
    recent.push(now);
    hits.set(key, recent);
  }

  router.get('/submissions/:id/ai-review', requireAuth, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    // Read-only: only the cached row is returned and ownership is enforced by
    // the same query the write path uses.
    const submission = await loadOwnedSubmission(routeParam(req, 'id'), req.user!.id);
    res.json({ review: await readStoredReview(submission.id, locale) });
  });

  router.post('/submissions/:id/ai-review', requireAuth, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    checkRate(req.user!.id, 'review');
    const review = await reviewSubmission(routeParam(req, 'id'), req.user!.id, locale, provider);
    res.json({ review });
  });

  router.get('/coach', requireAuth, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    // Read-only: returning the cached report must never spend tokens.
    res.json({ report: await readStoredCoachReport(req.user!.id, locale) });
  });

  router.post('/coach/generate', requireAuth, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    checkRate(req.user!.id, 'coach');
    const report = await coachLearner(req.user!.id, locale, provider);
    res.json({ report });
  });

  return router;
}
