import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveLocale } from '../locale.js';
import { routeParam } from '../params.js';
import { createAdminSimulation, getAdminSimulation, listAdminSimulations, parseSimulationInput, parseToggle, setSimulationActive, updateAdminSimulation } from './service.js';
import { createAdminMaterial, deleteAdminMaterial, getAdminMaterial, parseMaterialInput, updateAdminMaterial } from './materials.js';
import { createAdminTask, getAdminTask, parseTaskInput, updateAdminTask } from './tasks.js';

/** Admin endpoints. Guards are attached per route (not as a blanket
 *  router-level `use`) so an unmatched path still falls through to the API 404
 *  instead of turning into an auth error — the same choice as the mentor, AI
 *  and employer routers. */
export function adminRouter() {
  const router = Router();
  const adminOnly = [requireAuth, requireRole('ADMIN')] as const;

  router.get('/simulations', ...adminOnly, async (req, res) => {
    const locale = resolveLocale(req.query.locale);
    res.json({ simulations: await listAdminSimulations(locale) });
  });

  router.post('/simulations', ...adminOnly, async (req, res) => {
    const created = await createAdminSimulation(parseSimulationInput(req.body));
    res.status(201).json(created);
  });

  router.get('/simulations/:id', ...adminOnly, async (req, res) => {
    res.json({ simulation: await getAdminSimulation(routeParam(req, 'id')) });
  });

  router.put('/simulations/:id', ...adminOnly, async (req, res) => {
    res.json(await updateAdminSimulation(routeParam(req, 'id'), parseSimulationInput(req.body)));
  });

  router.patch('/simulations/:id/active', ...adminOnly, async (req, res) => {
    res.json(await setSimulationActive(routeParam(req, 'id'), parseToggle(req.body)));
  });

  router.post('/simulations/:id/tasks', ...adminOnly, async (req, res) => {
    const created = await createAdminTask(routeParam(req, 'id'), parseTaskInput(req.body));
    res.status(201).json(created);
  });

  router.get('/tasks/:taskId', ...adminOnly, async (req, res) => {
    res.json({ task: await getAdminTask(routeParam(req, 'taskId')) });
  });

  router.put('/tasks/:taskId', ...adminOnly, async (req, res) => {
    res.json(await updateAdminTask(routeParam(req, 'taskId'), parseTaskInput(req.body)));
  });

  router.post('/simulations/:id/materials', ...adminOnly, async (req, res) => {
    const created = await createAdminMaterial(routeParam(req, 'id'), parseMaterialInput(req.body));
    res.status(201).json(created);
  });

  router.get('/materials/:materialId', ...adminOnly, async (req, res) => {
    res.json({ material: await getAdminMaterial(routeParam(req, 'materialId')) });
  });

  router.put('/materials/:materialId', ...adminOnly, async (req, res) => {
    res.json(await updateAdminMaterial(routeParam(req, 'materialId'), parseMaterialInput(req.body)));
  });

  router.delete('/materials/:materialId', ...adminOnly, async (req, res) => {
    await deleteAdminMaterial(routeParam(req, 'materialId'));
    res.status(204).end();
  });

  return router;
}
