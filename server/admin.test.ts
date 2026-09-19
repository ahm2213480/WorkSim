import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { SESSION_COOKIE_NAME, createSession } from './auth/sessions.js';
import { hashPassword } from './auth/passwords.js';
import { prisma } from './db.js';

/** Admin catalog management, through the real HTTP app.
 *
 *  Authorization matrix: anonymous → 401; learner/mentor/employer → 403
 *  with no data; admin → full CRUD below; unknown ids are 404.
 *  Safety rules: no delete route for simulations/tasks; deactivation hides
 *  from the public catalog but keeps admin detail; duplicate slugs/orders
 *  are 409; malformed task JSON is a 400 here, never a learner 500. */

const runId = Date.now().toString(36);
const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000 });

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

function simBody(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    company: 'TestCo',
    roleTitleEn: 'Tester', roleTitleAr: 'مختبِر',
    titleEn: 'Test sim', titleAr: 'محاكاة اختبار',
    summaryEn: 'Summary', summaryAr: 'ملخص',
    briefEn: 'Brief', briefAr: 'موجز',
    estimatedMinutes: 60, sortOrder: 0, isActive: true,
    ...extra,
  };
}

function taskBody(order = 0, extra: Record<string, unknown> = {}) {
  return {
    order,
    titleEn: 'Task one', titleAr: 'المهمة الأولى',
    instructionsEn: 'Do the thing.', instructionsAr: 'نفّذ المطلوب.',
    fieldsJson: JSON.stringify([{ key: 'answer', kind: 'text', labelEn: 'Answer', labelAr: 'الإجابة', multiline: true, required: true }]),
    checklistJson: JSON.stringify({ version: 'v1', criteria: [{ key: 'answered', weight: 10, labelEn: 'Answered', labelAr: 'أجاب', check: { kind: 'nonEmpty', field: 'answer' } }] }),
    ...extra,
  };
}

describe('admin auth gates', () => {
  it('rejects anonymous callers with 401', async () => {
    for (const probe of [
      request(app).get('/api/admin/simulations'),
      request(app).post('/api/admin/simulations').send(simBody(`anon-${runId}`)),
      request(app).get('/api/admin/simulations/nothing'),
    ]) {
      const response = await probe;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects learner, mentor and employer with 403 and no data', async () => {
    for (const role of ['LEARNER', 'MENTOR', 'EMPLOYER']) {
      const account = await createUser(`denied-${role.toLowerCase()}`, role);
      const response = await request(app).get('/api/admin/simulations').set('Cookie', account.Cookie);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.simulations).toBeUndefined();
    }
  });
});

describe('admin simulation management', () => {
  it('creates, reads, edits and deactivates a simulation', async () => {
    const admin = await createUser('catalog-admin', 'ADMIN');
    const slug = `admin-sim-${runId}`;

    const created = await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody(slug));
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe(slug);

    const detail = await request(app).get(`/api/admin/simulations/${created.body.id}`).set('Cookie', admin.Cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.simulation.titleEn).toBe('Test sim');
    expect(detail.body.simulation.isActive).toBe(true);

    const updated = await request(app).put(`/api/admin/simulations/${created.body.id}`).set('Cookie', admin.Cookie)
      .send(simBody(slug, { titleEn: 'Renamed sim' }));
    expect(updated.status).toBe(200);

    const toggled = await request(app).patch(`/api/admin/simulations/${created.body.id}/active`).set('Cookie', admin.Cookie)
      .send({ isActive: false });
    expect(toggled.status).toBe(200);
    expect(toggled.body.isActive).toBe(false);

    // Deactivation hides it from the public catalog but keeps admin detail.
    const publicList = await request(app).get('/api/simulations?locale=EN');
    expect(publicList.body.simulations.some((s: { slug: string }) => s.slug === slug)).toBe(false);
    const stillThere = await request(app).get(`/api/admin/simulations/${created.body.id}`).set('Cookie', admin.Cookie);
    expect(stillThere.body.simulation.isActive).toBe(false);

    const reactivated = await request(app).patch(`/api/admin/simulations/${created.body.id}/active`).set('Cookie', admin.Cookie)
      .send({ isActive: true });
    expect(reactivated.body.isActive).toBe(true);
  });

  it('rejects duplicate and malformed slugs, 404s unknown, offers no delete', async () => {
    const admin = await createUser('slug-admin', 'ADMIN');
    const slug = `dupe-${runId}`;
    expect((await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody(slug))).status).toBe(201);
    const dupe = await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody(slug));
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe('SLUG_TAKEN');
    const bad = await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody('NOT A SLUG!!'));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await request(app).get('/api/admin/simulations/nope').set('Cookie', admin.Cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SIMULATION_NOT_FOUND');
    // Simulations are never deleted through the API (evidence references them).
    const deleted = await request(app).delete('/api/admin/simulations/novashop-mobile-checkout').set('Cookie', admin.Cookie);
    expect(deleted.status).not.toBe(200);
  });
});

describe('admin task and material management', () => {
  it('creates and edits a task; bad JSON is a 400, never a learner 500', async () => {
    const admin = await createUser('task-admin', 'ADMIN');
    const sim = await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody(`task-sim-${runId}`));
    expect(sim.status).toBe(201);

    const created = await request(app).post(`/api/admin/simulations/${sim.body.id}/tasks`).set('Cookie', admin.Cookie).send(taskBody(0));
    expect(created.status).toBe(201);

    const read = await request(app).get(`/api/admin/tasks/${created.body.id}`).set('Cookie', admin.Cookie);
    expect(read.status).toBe(200);
    expect(read.body.task.titleEn).toBe('Task one');

    const updated = await request(app).put(`/api/admin/tasks/${created.body.id}`).set('Cookie', admin.Cookie)
      .send(taskBody(0, { titleEn: 'Task one (revised)' }));
    expect(updated.status).toBe(200);

    const badJson = await request(app).put(`/api/admin/tasks/${created.body.id}`).set('Cookie', admin.Cookie)
      .send(taskBody(0, { fieldsJson: 'not-json' }));
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('VALIDATION_ERROR');

    const badRubric = await request(app).put(`/api/admin/tasks/${created.body.id}`).set('Cookie', admin.Cookie)
      .send(taskBody(0, { checklistJson: JSON.stringify({ version: 'v1', criteria: [] }) }));
    expect(badRubric.status).toBe(400);
  });

  it('manages materials with full CRUD', async () => {
    const admin = await createUser('material-admin', 'ADMIN');
    const sim = await request(app).post('/api/admin/simulations').set('Cookie', admin.Cookie).send(simBody(`mat-sim-${runId}`));
    expect(sim.status).toBe(201);

    const payload = { order: 0, kind: 'BRIEF', titleEn: 'Brief', titleAr: 'موجز', contentEn: 'Hello', contentAr: 'مرحبًا' };
    const created = await request(app).post(`/api/admin/simulations/${sim.body.id}/materials`).set('Cookie', admin.Cookie).send(payload);
    expect(created.status).toBe(201);

    const updated = await request(app).put(`/api/admin/materials/${created.body.id}`).set('Cookie', admin.Cookie)
      .send({ ...payload, contentEn: 'Hello, revised' });
    expect(updated.status).toBe(200);

    const removed = await request(app).delete(`/api/admin/materials/${created.body.id}`).set('Cookie', admin.Cookie);
    expect(removed.status).toBe(204);
    const gone = await request(app).get(`/api/admin/materials/${created.body.id}`).set('Cookie', admin.Cookie);
    expect(gone.status).toBe(404);
  });
});

