import { PrismaClient } from '@prisma/client';
import { getEnv } from './env.js';

// One client per process. Connections open lazily on the first query, so
// importing this module is always safe. PrismaClient reads DATABASE_URL from
// the environment itself; tests set it before importing this module.
export const prisma = new PrismaClient({
  log: getEnv().NODE_ENV === 'test' ? ['error'] : ['error', 'warn'],
});
