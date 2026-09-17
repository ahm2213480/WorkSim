import type { Dictionary } from './locale';
import { ApiError } from './api';

/** Maps an ApiError to localized, user-facing text. The server's message is
 *  deliberately not shown verbatim: it is English-only and can leak internal
 *  wording, so pages translate by machine-readable error code instead. */
export function describeError(t: Dictionary, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return t.errorNetwork;
    if (error.code === 'INVALID_CREDENTIALS') return t.errorInvalidCredentials;
    if (error.code === 'EMAIL_TAKEN') return t.errorEmailTaken;
    if (error.code === 'VALIDATION_ERROR') return t.errorValidation;
  }
  return t.errorUnknown;
}
