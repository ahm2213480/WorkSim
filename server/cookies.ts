/** Minimal cookie helpers - only what cookie-based sessions need. This avoids
 *  a dependency for reading the session cookie and writing its Set-Cookie
 *  header. The session token uses base64url, which is cookie-safe as-is. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    const raw = part.slice(at + 1).trim();
    if (!name) continue;
    try { jar[name] = decodeURIComponent(raw); } catch { jar[name] = raw; }
  }
  return jar;
}

export function sessionCookie(token: string, options: { secure: boolean; maxAgeSeconds: number }): string {
  const attributes = [
    `worksim_session=${token}`,
    'Path=/',
    'HttpOnly', // JavaScript must not be able to read the session token.
    'SameSite=Lax', // Withholds the cookie on cross-site state-changing requests.
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  const attributes = ['worksim_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
