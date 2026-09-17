import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { clearedSessionCookie, sessionCookie } from '../cookies.js';
import { prisma } from '../db.js';
import { HttpError, validationError } from '../http-error.js';
import { requireAuth } from './middleware.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './passwords.js';
import {
  SESSION_TTL_SECONDS,
  createSession,
  destroySession,
  sessionTokenFromRequest,
  toPublicUser,
} from './sessions.js';

export interface AuthOptions {
  rateLimitPerWindow: number;
  cookieSecure: boolean;
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(200),
  locale: z.enum(['EN', 'AR']).default('EN'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

function parseBody<Schema extends z.ZodTypeAny>(schema: Schema, body: unknown): z.infer<Schema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue ? issue.path.join('.') || 'body' : 'body';
    throw validationError(issue ? `${field}: ${issue.message}` : 'Invalid request body.');
  }
  return result.data;
}

/** In-memory limiter for the auth endpoints (single instance, 60s window).
 *  It exists to blunt credential stuffing, not to be a distributed solution -
 *  that would need shared storage once the app scales beyond one instance. */
function rateLimiter(maxPerWindow: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > maxPerWindow) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.'));
      return;
    }
    next();
  };
}

export function authRouter(options: AuthOptions): Router {
  const router = Router();
  const limitAuth = rateLimiter(options.rateLimitPerWindow);

  router.post('/register', limitAuth, async (req, res) => {
    const data = parseBody(registerSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    // Public registration always creates a LEARNER; client input can never
    // elevate a role. Staff accounts are provisioned by seeding/admin only.
    // The pre-check gives a friendly 409; the P2002 handler below covers the
    // rare concurrent-registration race that slips past the check.
    let user;
    try {
      user = await prisma.user.create({
        data: { email: data.email, name: data.name, passwordHash: hashPassword(data.password), role: 'LEARNER', locale: data.locale },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
      throw error;
    }
    const token = await createSession(user.id);
    res.set('Set-Cookie', sessionCookie(token, { secure: options.cookieSecure, maxAgeSeconds: SESSION_TTL_SECONDS }));
    res.status(201).json({ user: toPublicUser(user) });
  });

  router.post('/login', limitAuth, async (req, res) => {
    const data = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const passwordOk = verifyPassword(data.password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const token = await createSession(user.id);
    res.set('Set-Cookie', sessionCookie(token, { secure: options.cookieSecure, maxAgeSeconds: SESSION_TTL_SECONDS }));
    res.json({ user: toPublicUser(user) });
  });

  router.post('/logout', async (req, res) => {
    await destroySession(sessionTokenFromRequest(req));
    res.set('Set-Cookie', clearedSessionCookie(options.cookieSecure));
    res.status(204).send();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
