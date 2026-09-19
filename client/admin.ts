import { apiFetch } from './api';

/** Typed access to the admin catalog endpoints (server/admin). All routes
 *  require the ADMIN role server-side; the UI additionally gates navigation.
 *  Simulations and tasks are never deleted through the API (learner evidence
 *  references them) — only created, edited and activated/deactivated.
 *  Materials are unreferenced, so they support full CRUD. */

export interface AdminSimulationItem {
  id: string;
  slug: string;
  company: string;
  title: string;
  isActive: boolean;
  estimatedMinutes: number;
  taskCount: number;
  materialCount: number;
  attemptCount: number;
}

export interface AdminSimulationDetail extends AdminSimulationItem {
  roleTitleEn: string; roleTitleAr: string;
  titleEn: string; titleAr: string;
  summaryEn: string; summaryAr: string;
  briefEn: string; briefAr: string;
  sortOrder: number;
  tasks: { id: string; order: number; titleEn: string; titleAr: string; fieldCount: number; criterionCount: number }[];
  materials: { id: string; order: number; kind: string; titleEn: string; titleAr: string }[];
}

export interface AdminTask {
  id: string;
  simulationId: string;
  order: number;
  titleEn: string;
  titleAr: string;
  instructionsEn: string;
  instructionsAr: string;
  fieldsJson: string;
  checklistJson: string;
}

export interface AdminMaterial {
  id: string;
  simulationId: string;
  order: number;
  kind: string;
  titleEn: string;
  titleAr: string;
  contentEn: string;
  contentAr: string;
}

export function listAdminSimulations(locale: string) {
  return apiFetch<{ simulations: AdminSimulationItem[] }>(`/api/admin/simulations?locale=${locale.toUpperCase()}`);
}

export function getAdminSimulation(id: string) {
  return apiFetch<{ simulation: AdminSimulationDetail }>(`/api/admin/simulations/${encodeURIComponent(id)}`);
}

export function createAdminSimulation(body: Record<string, unknown>) {
  return apiFetch<{ id: string; slug: string }>('/api/admin/simulations', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAdminSimulation(id: string, body: Record<string, unknown>) {
  return apiFetch<{ id: string; slug: string }>(`/api/admin/simulations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function setAdminSimulationActive(id: string, isActive: boolean) {
  return apiFetch<{ id: string; isActive: boolean }>(`/api/admin/simulations/${encodeURIComponent(id)}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export function getAdminTask(taskId: string) {
  return apiFetch<{ task: AdminTask }>(`/api/admin/tasks/${encodeURIComponent(taskId)}`);
}

export function createAdminTask(simulationId: string, body: Record<string, unknown>) {
  return apiFetch<{ id: string }>(`/api/admin/simulations/${encodeURIComponent(simulationId)}/tasks`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateAdminTask(taskId: string, body: Record<string, unknown>) {
  return apiFetch<{ id: string }>(`/api/admin/tasks/${encodeURIComponent(taskId)}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function getAdminMaterial(materialId: string) {
  return apiFetch<{ material: AdminMaterial }>(`/api/admin/materials/${encodeURIComponent(materialId)}`);
}

export function createAdminMaterial(simulationId: string, body: Record<string, unknown>) {
  return apiFetch<{ id: string }>(`/api/admin/simulations/${encodeURIComponent(simulationId)}/materials`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateAdminMaterial(materialId: string, body: Record<string, unknown>) {
  return apiFetch<{ id: string }>(`/api/admin/materials/${encodeURIComponent(materialId)}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteAdminMaterial(materialId: string) {
  return apiFetch<void>(`/api/admin/materials/${encodeURIComponent(materialId)}`, { method: 'DELETE' });
}
