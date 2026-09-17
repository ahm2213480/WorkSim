import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../http-error.js';
import { readSessionUser, sessionTokenFromRequest, type PublicUser } from './sessions.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express augmentation requires a namespace.
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

/** Server-side authentication is the single source of truth. The client may
 *  mirror the user for UX, but every protected endpoint re-checks it here. */
export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const user = await readSessionUser(sessionTokenFromRequest(req));
    if (!user) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
      return;
    }
    next();
  };
}
