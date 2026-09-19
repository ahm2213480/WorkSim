import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { loadCompletedMentorFeedback, loadOwnedSubmission } from './service.js';
import { buildEvidence } from './view.js';

/** The learner's own view of a submission: what was submitted, how it was
 *  scored by the deterministic rubric, which skills it demonstrated, the
 *  messages that arrived while they worked, and the completed human review
 *  (mentor feedback) when one exists — null while the review is still
 *  pending, which the UI renders as a "pending mentor review" state. */
export function submissionsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/:id', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    const submission = await loadOwnedSubmission(routeParam(req, 'id'), req.user!.id);
    // buildEvidence is synchronous; only the review lookup needs a query.
    const mentorFeedback = await loadCompletedMentorFeedback(submission.id);
    res.json({ evidence: buildEvidence(submission, locale, true), mentorFeedback });
  });

  return router;
}
