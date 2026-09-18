import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { loadOwnedSubmission } from './service.js';
import { buildEvidence } from './view.js';

/** The learner's own view of a submission: what was submitted, how it was
 *  scored by the deterministic rubric, which skills it demonstrated, and the
 *  messages that arrived while they worked. */
export function submissionsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/:id', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    const submission = await loadOwnedSubmission(routeParam(req, 'id'), req.user!.id);
    res.json({ evidence: buildEvidence(submission, locale, true) });
  });

  return router;
}
