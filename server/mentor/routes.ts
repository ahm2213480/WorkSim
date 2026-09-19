import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { completeMentorReview, draftReviewInputSchema, completeReviewInputSchema, getMentorSubmissionDetail, listMentorSubmissions, parseMentorBody, saveMentorReview } from './service.js';

/** Mentor endpoints. Guards are attached per route (not as a blanket
 *  router-level `use`) so an unmatched path still falls through to the API 404
 *  instead of turning into an auth error — the same choice as the AI router.
 *  Every route acts on `req.user.id` as the mentor id; assignment scoping is
 *  enforced inside the service queries, so a mentor can never reach another
 *  learner's work by guessing ids. */
export function mentorRouter() {
  const router = Router();
  const mentorOnly = [requireAuth, requireRole('MENTOR')] as const;

  router.get('/submissions', ...mentorOnly, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    res.json({ submissions: await listMentorSubmissions(req.user!.id, locale) });
  });

  router.get('/submissions/:id', ...mentorOnly, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    res.json(await getMentorSubmissionDetail(routeParam(req, 'id'), req.user!.id, locale));
  });

  router.put('/submissions/:id/review', ...mentorOnly, async (req, res) => {
    const { feedback } = parseMentorBody(draftReviewInputSchema, req.body);
    res.json({ review: await saveMentorReview(routeParam(req, 'id'), req.user!.id, feedback, false) });
  });

  router.post('/submissions/:id/review/complete', ...mentorOnly, async (req, res) => {
    const { feedback } = parseMentorBody(completeReviewInputSchema, req.body);
    res.json({ review: await completeMentorReview(routeParam(req, 'id'), req.user!.id, feedback) });
  });

  return router;
}
