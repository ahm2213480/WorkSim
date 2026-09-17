import path from 'node:path';

// Must be the FIRST import in any test file: it pins the environment before
// modules that read configuration (server/env.ts) are evaluated.
process.env.NODE_ENV ??= 'test';
process.env.AUTH_RATE_LIMIT ??= '30';
// Absolute SQLite URL with forward slashes (Windows-safe for Prisma's file: URLs).
process.env.DATABASE_URL = `file:${path.resolve('prisma/test.db').split(path.sep).join('/')}`;
