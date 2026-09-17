/** Operational error carrying an HTTP status and a machine-readable code.
 *  Its message is safe to show to users. Any other error is treated as a bug
 *  and never leaks internals to the client (see the error handler in app.ts). */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validationError(message: string): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}
