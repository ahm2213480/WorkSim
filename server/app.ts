import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';

export function createApp(clientDirectory?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));
  // Liveness only: database/provider readiness will be checked separately.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'worksim-api' });
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
  });
  if (clientDirectory) {
    app.use(express.static(clientDirectory));
    app.get('/{*path}', (_req, res, next) => {
      res.sendFile(path.join(clientDirectory, 'index.html'), (error) => { if (error) next(error); });
    });
  }
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
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
