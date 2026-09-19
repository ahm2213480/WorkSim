// Phase 8 live E2E: runs against the production server (port 3199).
// Verifies the registered-language preference flows end to end: a fresh
// registration with locale=AR stores it on the account, /api/auth/me returns
// it, and login responses carry it — which is what the client's
// useAccountLocalePreference uses to adopt Arabic automatically (RTL) for
// accounts with no explicit in-browser choice.
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3199';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

const main = async () => {
  // 1. Register an Arabic-preferring account.
  const email = `arabic-user-${Date.now()}@worksim.dev`;
  const register = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'أمينة العربية', email, password: 'Arabic-Pass-1', locale: 'AR' }),
  });
  const registerBody = await register.json();
  const registerCookie = (register.headers.get('set-cookie') ?? '').split(';')[0];
  check('register locale=AR stored', register.status === 201 && registerBody.user?.locale === 'AR', registerBody.user?.locale);

  // 2. Restored session carries the Arabic preference.
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: registerCookie } });
  const meBody = await me.json();
  check('me returns locale=AR', me.status === 200 && meBody.user?.locale === 'AR', meBody.user?.locale);

  // 3. A repeat login also returns the preference (drives auto-adopt on login).
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Arabic-Pass-1' }),
  });
  const loginBody = await login.json();
  check('login returns locale=AR', login.status === 200 && loginBody.user?.locale === 'AR', loginBody.user?.locale);

  // 4. Seeded demo accounts keep their EN default (no accidental overwrite).
  const demo = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employer@worksim.dev', password: 'Worksim-demo-1' }),
  });
  const demoBody = await demo.json();
  check('demo employer stays EN', demo.status === 200 && demoBody.user?.locale === 'EN', demoBody.user?.locale);

  // 5. Server renders Arabic catalog content when asked (?locale=AR).
  const catalog = await fetch(`${BASE}/api/simulations?locale=AR`);
  const catalogBody = await catalog.json();
  const arabicTitle = catalogBody.simulations?.[0]?.title ?? '';
  check('catalog serves Arabic', catalog.status === 200 && /[\u0600-\u06FF]/.test(arabicTitle), arabicTitle);

  // 6. SPA fallback still serves the app shell (RTL applied client-side).
  const spa = await fetch(`${BASE}/`);
  const html = await spa.text();
  check('SPA shell served', spa.status === 200 && html.includes('id="root"'), `status=${spa.status}`);

  console.log(failures === 0 ? '\nALL PHASE 8 E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => { console.error('E2E crashed:', error); process.exit(1); });
