import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { parseCookies } from '../cookies.js';
import { prisma } from '../db.js';

export const SESSION_COOKIE_NAME = 'worksim_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  locale: string;
}

/** Only the fields the client may ever see; the password hash never leaves the
 *  server and is never selected into API responses. */
export function toPublicUser(user: { id: string; name: string; email: string; role: string; locale: string }): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale };
}

/** Only the SHA-256 hash of the token is stored, so a database leak cannot be
 *  replayed as someone's login. The raw token exists only in the cookie. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  return token;
}

export async function readSessionUser(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    // Expired sessions are removed when they are encountered, not on a timer.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toPublicUser(session.user);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function sessionTokenFromRequest(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
}
