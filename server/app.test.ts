import './test-env.js'; // Must stay first: pins the test environment before any config is read.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('foundation API', () => {
  const app = createApp();
  it('reports liveness without exposing internals', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'worksim-api' });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('returns a structured API 404', async () => {
    const response = await request(app).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
  it('rejects malformed JSON without a stack trace', async () => {
    const response = await request(app).post('/api/missing').set('Content-Type', 'application/json').send('{bad');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(response.text).not.toContain('SyntaxError');
  });
  it('limits request body size', async () => {
    const response = await request(app).post('/api/missing').send({ text: 'a'.repeat(70_000) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
