import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { getEmployerEvidenceDetail, listEmployerEvidence } from './service.js';

/** Employer endpoints. Guards are attached per route (not as a blanket
 *  router-level `use`) so an unmatched path still falls through to the API 404
 *  instead of turning into an auth error — the same choice as the mentor and AI
 *  routers. Every route acts on `req.user.id` as the employer id; consent
 *  scoping (`EvidenceShare`) is enforced inside the service queries, so an
 *  employer can never reach a learner's evidence by guessing ids.
 *
 *  There are deliberately no POST/PUT/PATCH/DELETE routes: the employer
 *  workflow is read-only. Any write attempt falls through to the API 404. */
export function employerRouter() {
  const router = Router();
  const employerOnly = [requireAuth, requireRole('EMPLOYER')] as const;

  router.get('/evidence', ...employerOnly, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    res.json({ submissions: await listEmployerEvidence(req.user!.id, locale) });
  });

  router.get('/evidence/:id', ...employerOnly, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    res.json(await getEmployerEvidenceDetail(routeParam(req, 'id'), req.user!.id, locale));
  });

  return router;
}
