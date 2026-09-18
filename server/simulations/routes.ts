import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { HttpError } from '../http-error.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { startOrResumeAttempt } from '../attempts/service.js';
import { toDetail, toListItem } from './view.js';

/** Catalog endpoints. Reading the catalog is public (an assessment visitor can
 *  see what is available before registering), while starting a simulation
 *  requires a session because an attempt belongs to a learner. */
export function simulationsRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    const simulations = await prisma.simulation.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        skills: { include: { skill: true } },
        _count: { select: { tasks: true, materials: true } },
      },
    });
    res.json({
      simulations: simulations.map((simulation) =>
        toListItem(
          simulation,
          locale,
          simulation.skills.map((link) => link.skill),
          { tasks: simulation._count.tasks, materials: simulation._count.materials },
        ),
      ),
    });
  });

  router.get('/:idOrSlug', async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    const idOrSlug = routeParam(req, 'idOrSlug');
    const simulation = await prisma.simulation.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        skills: { include: { skill: true } },
        materials: { orderBy: { order: 'asc' } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    if (!simulation || !simulation.isActive) {
      throw new HttpError(404, 'SIMULATION_NOT_FOUND', 'That simulation does not exist.');
    }
    res.json({
      simulation: toDetail(
        simulation,
        locale,
        simulation.skills.map((link) => link.skill),
        simulation.materials,
        simulation.tasks,
      ),
    });
  });

  // Starting is idempotent per learner and task: the second call resumes the
  // same attempt instead of creating a parallel one, so a learner who reloads
  // or reopens the tab cannot end up with two competing work products.
  router.post('/:idOrSlug/start', requireAuth, async (req, res) => {
    const attemptId = await startOrResumeAttempt(req.user!.id, routeParam(req, 'idOrSlug'));
    res.status(201).json({ attemptId });
  });

  return router;
}
