import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { attemptsRouter } from './attempts/routes.js';
import { authRouter } from './auth/routes.js';
import { aiRouter } from './ai/routes.js';
import { defaultProvider, type AiProvider } from './ai/provider.js';
import { getEnv } from './env.js';
import { HttpError } from './http-error.js';
import { simulationsRouter } from './simulations/routes.js';
import { submissionsRouter } from './submissions/routes.js';
import { mentorRouter } from './mentor/routes.js';
import { employerRouter } from './employer/routes.js';

export interface AppOptions {
  /** Directory of the built client assets (production only). */
  clientDirectory?: string;
  /** Overrides the COOKIE_SECURE environment setting (used by tests). */
  cookieSecure?: boolean;
  /** Overrides AUTH_RATE_LIMIT (used by tests). */
  rateLimitPerWindow?: number;
  /** Overrides the AI provider (tests inject a fake; default reads env). */
  aiProvider?: AiProvider;
  /** Overrides DEMO_AUTO_ASSIGN_MENTOR (used by tests). */
  demoAutoAssignMentor?: boolean;
  /** Overrides DEMO_AUTO_SHARE_EVIDENCE (used by tests). */
  demoAutoShareEvidence?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const env = getEnv();
  const app = express();
  app.disable('x-powered-by');
  // In production the app runs behind a reverse proxy; trusting one hop makes
  // req.ip the real client address so the auth rate limiter keys correctly.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));

  // Same-origin by design: production serves API and built client from this one
  // process, and development uses the Vite proxy. No cross-origin requests, so
  // there is no CORS layer and session cookies never leave this origin.
  app.use('/api/auth', authRouter({
    rateLimitPerWindow: options.rateLimitPerWindow ?? env.AUTH_RATE_LIMIT,
    cookieSecure: options.cookieSecure ?? (env.COOKIE_SECURE === 'auto' ? env.NODE_ENV === 'production' : env.COOKIE_SECURE === 'true'),
  }));

  // Liveness only: database/provider readiness will be checked separately.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'worksim-api' });
  });

  // Catalog reads are public; starting a simulation is not (see simulations/routes.ts).
  app.use('/api/simulations', simulationsRouter());
  // Attempts and submissions are always scoped to the signed-in learner.
  app.use('/api/attempts', attemptsRouter({
    // Dev/demo convenience: 'auto' resolves to development only, so production
    // keeps the rule that mentor assignments are never created from a request.
    demoAutoAssignMentor: options.demoAutoAssignMentor
      ?? (env.DEMO_AUTO_ASSIGN_MENTOR === 'auto' ? env.NODE_ENV === 'development' : env.DEMO_AUTO_ASSIGN_MENTOR === 'true'),
    // Dev/demo convenience: 'auto' resolves to development only, so production
    // keeps the rule that evidence sharing is consent-based, never implicit.
    demoAutoShareEvidence: options.demoAutoShareEvidence
      ?? (env.DEMO_AUTO_SHARE_EVIDENCE === 'auto' ? env.NODE_ENV === 'development' : env.DEMO_AUTO_SHARE_EVIDENCE === 'true'),
  }));
  app.use('/api/submissions', submissionsRouter());
  // Mentor review endpoints: requireRole('MENTOR') per route, and every query
  // is scoped to the learners assigned to that mentor (server/mentor).
  app.use('/api/mentor', mentorRouter());
  // Employer evidence endpoints: requireRole('EMPLOYER') per route, read-only,
  // and every query is scoped to learners who granted consent (server/employer).
  app.use('/api/employer', employerRouter());
  // AI endpoints (review + coach) are owned by the signed-in user and rate
  // limited for cost; the provider is injectable so tests use a fake.
  app.use('/api', aiRouter(options.aiProvider ?? defaultProvider()));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
  });
  if (options.clientDirectory) {
    app.use(express.static(options.clientDirectory));
    app.get('/{*path}', (_req, res, next) => {
      res.sendFile(path.join(options.clientDirectory as string, 'index.html'), (error) => { if (error) next(error); });
    });
  }
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    // Operational errors carry a safe, user-facing message. Everything else is
    // a bug: it is logged server-side and details never reach the client.
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    // body-parser failures (malformed JSON, oversized bodies) are plain Errors
    // with a numeric status; they are expected client mistakes, not crashes.
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON', message: 'Request body is invalid or too large.' } });
      return;
    }
    console.error('Unhandled server error', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  };
  app.use(handleError);
  return app;
}
