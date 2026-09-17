import { z } from 'zod';

// All runtime configuration is validated once, in one place. Secrets stay in
// .env (never committed); this file only defines their shape and defaults.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // 'auto' derives the session cookie's Secure flag from NODE_ENV (on in
  // production). 'false' is only for local production-mode testing over HTTP.
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  SEED_DEMO_PASSWORD: z.string().min(8).default('Worksim-demo-1'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed on first use; tests set environment variables before importing any
 *  module that reaches this file (see server/test-env.ts). */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'unknown').join(', ');
    throw new Error(`Invalid server configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
