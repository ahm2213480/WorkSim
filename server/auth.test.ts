import './test-env.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { requireAuth, requireRole } from './auth/middleware.js';
import { hashPassword, verifyPassword } from './auth/passwords.js';
import { SESSION_COOKIE_NAME, createSession, hashToken } from './auth/sessions.js';
import { prisma } from './db.js';
import { HttpError } from './http-error.js';

const runId = Date.now().toString(36);
const PASSWORD = 'Correct-Horse-1';

// Shared app for endpoint behaviour. Its limiter is raised far above the number
// of requests this file makes; rate limiting itself gets a dedicated app below.
const app = createApp({ cookieSecure: false, rateLimitPerWindow: 1000 });

/** Full Set-Cookie header for the session cookie, attributes included. */
function setCookieHeader(res: { headers: Record<string, unknown> }): string {
  const jar: unknown = res.headers['set-cookie'];
  const list = Array.isArray(jar) ? jar.map(String) : typeof jar === 'string' ? [jar] : [];
  const header = list.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!header) throw new Error('Expected the session cookie to be set');
  return header;
}

/** Cookie name/value pair ready to send back in a Cookie header. */
function sessionCookiePair(res: { headers: Record<string, unknown> }): string {
  const pair = setCookieHeader(res).split(';')[0];
  if (!pair) throw new Error('Malformed Set-Cookie header');
  return pair;
}

function createUser(email: string, role: string) {
  return prisma.user.create({
    data: { email, name: 'Test User', passwordHash: hashPassword(PASSWORD), role, locale: 'EN' },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('password hashing', () => {
  it('verifies correct passwords and rejects wrong or malformed hashes', () => {
    const stored = hashPassword(PASSWORD);
    expect(stored.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword(PASSWORD, stored)).toBe(true);
    expect(verifyPassword('Wrong-Horse-1', stored)).toBe(false);
    expect(verifyPassword(PASSWORD, 'garbage')).toBe(false);
  });
});

describe('POST /api/auth/register', () => {
  it('creates a LEARNER account, never trusting client-sent roles', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: `reg-${runId}@test.dev`, name: 'Reg Tester', password: PASSWORD, locale: 'AR', role: 'ADMIN',
    });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: `reg-${runId}@test.dev`, name: 'Reg Tester', role: 'LEARNER', locale: 'AR',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    const cookie = setCookieHeader(response);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=');
    expect(cookie).not.toContain('Secure'); // This app was built with cookieSecure: false.
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: `reg-${runId}@test.dev` } });
    expect(stored.passwordHash.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword(PASSWORD, stored.passwordHash)).toBe(true);
  });

  it('rejects duplicate emails with 409', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: `reg-${runId}@test.dev`, name: 'Reg Tester', password: PASSWORD,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the body server-side', async () => {
    const response = await request(app).post('/api/auth/register').send({ email: 'not-an-email', name: 'x', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets the session cookie', async () => {
    await createUser(`login-${runId}@test.dev`, 'LEARNER');
    const response = await request(app).post('/api/auth/login').send({ email: `login-${runId}@test.dev`, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(`login-${runId}@test.dev`);
    expect(sessionCookiePair(response)).toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it('answers wrong password and unknown email identically (no account enumeration)', async () => {
    await createUser(`login2-${runId}@test.dev`, 'LEARNER');
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: `login2-${runId}@test.dev`, password: 'Wrong-Horse-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: `ghost-${runId}@test.dev`, password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('session lifecycle', () => {
  it('exposes /me while active, then invalidates everything after logout', async () => {
    const user = await createUser(`session-${runId}@test.dev`, 'LEARNER');
    const token = await createSession(user.id);
    const headers = { Cookie: `${SESSION_COOKIE_NAME}=${token}` };

    const me = await request(app).get('/api/auth/me').set(headers);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);

    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const logout = await request(app).post('/api/auth/logout').set(headers);
    expect(logout.status).toBe(204);
    expect(setCookieHeader(logout)).toContain('Max-Age=0');

    const afterLogout = await request(app).get('/api/auth/me').set(headers);
    expect(afterLogout.status).toBe(401);
  });

  it('rejects expired sessions and deletes them on encounter', async () => {
    const user = await createUser(`expiry-${runId}@test.dev`, 'LEARNER');
    const token = await createSession(user.id);
    await prisma.session.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    expect(response.status).toBe(401);
    expect(await prisma.session.count({ where: { tokenHash: hashToken(token) } })).toBe(0);
  });
});

describe('role authorization', () => {
  // A minimal app exercising requireAuth + requireRole directly — the same
  // middleware the mentor/employer/admin routes will be protected with.
  const probe = express();
  probe.get('/probe', requireAuth, requireRole('MENTOR'), (_req: Request, res: Response) => { res.json({ ok: true }); });
  probe.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: { code: error.code } }); return; }
    next(error);
  });

  it('blocks anonymous callers (401) and learners (403), admits mentors (200)', async () => {
    const learner = await createUser(`learner-${runId}@test.dev`, 'LEARNER');
    const mentor = await createUser(`mentor-${runId}@test.dev`, 'MENTOR');
    const learnerToken = await createSession(learner.id);
    const mentorToken = await createSession(mentor.id);

    const anonymous = await request(probe).get('/probe');
    expect(anonymous.status).toBe(401);

    const forbidden = await request(probe).get('/probe').set('Cookie', `${SESSION_COOKIE_NAME}=${learnerToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const allowed = await request(probe).get('/probe').set('Cookie', `${SESSION_COOKIE_NAME}=${mentorToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ ok: true });
  });
});

describe('auth rate limiting', () => {
  it('returns 429 with Retry-After once the per-window budget is spent', async () => {
    const limited = createApp({ cookieSecure: false, rateLimitPerWindow: 2 });
    const attempt = () =>
      request(limited).post('/api/auth/login').send({ email: `rl-${runId}@test.dev`, password: PASSWORD });
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const third = await attempt();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });
});
