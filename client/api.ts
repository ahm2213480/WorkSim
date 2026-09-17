/** Thrown for any failed API call. `code`/`message` come from the server's
 *  error envelope ({ error: { code, message } }) when present, so pages can
 *  show meaningful text; `status` 0 means the request never left the browser. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fetch wrapper for the JSON API. Cookies stay same-origin by design (the
 *  Express server serves both the API and the built client), and every failure
 *  is normalized to ApiError so components never parse raw responses. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'The server could not be reached.');
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(response.status, detail?.code ?? 'UNKNOWN', detail?.message ?? 'The request failed.');
  }
  return body as T;
}
