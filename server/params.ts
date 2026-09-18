import type { Request } from 'express';

/** Express 5 types route params as `string | string[] | undefined`.
 *
 *  Prisma's argument inference silently falls back to a scalar-only result type
 *  when a `where` value is not a plain string, which would strip included
 *  relations from the response at compile time. Every route therefore narrows
 *  its params once through this helper instead of passing `req.params.x` on. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
