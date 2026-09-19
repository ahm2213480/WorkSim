// Guards the production invariant: DEMO_AUTO_ASSIGN_MENTOR 'auto' must resolve
// to OFF outside development, so no real deployment ever creates a mentor
// assignment from a request. Runs the server with NODE_ENV=production.
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:3199';
const child = spawn(
  process.execPath,
  ['-e', "process.env.NODE_ENV='production';process.env.PORT='3199';import('./dist/server/index.js')"],
  { cwd: process.cwd(), stdio: 'inherit' },
);
process.on('exit', () => child.kill());

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let attempt = 0; attempt < 20; attempt += 1) {
  try { await (await fetch(`${BASE}/api/health`)).json(); break; } catch { await wait(500); }
}

const email = `prod-guard-${Date.now()}@worksim.dev`;
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Prod Guard', email, password: 'Prod-Guard-1', locale: 'EN' }),
});
const learnerCookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];

const started = await (await fetch(`${BASE}/api/simulations/novashop-mobile-checkout/start`, { method: 'POST', headers: { Cookie: learnerCookie } })).json();
const submitted = await (await fetch(`${BASE}/api/attempts/${started.attemptId}/submit`, {
  method: 'POST',
  headers: { Cookie: learnerCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ work: { diagnosis: 'd', patch: 'p', testPlan: 't', estimate: 'e' } }),
})).json();
check('submission still succeeds in production', !!submitted.evidence?.id);

const mentor = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mentor@worksim.dev', password: 'Worksim-demo-1' }) });
const mentorCookie = (mentor.headers.get('set-cookie') ?? '').split(';')[0];
const queue = await (await fetch(`${BASE}/api/mentor/submissions?locale=EN`, { headers: { Cookie: mentorCookie } })).json();
const leaked = queue.submissions?.some((entry) => entry.id === submitted.evidence?.id);
check('production does NOT auto-assign the new learner', !leaked, `inQueue=${!!leaked}`);

console.log(failures === 0 ? '\nPRODUCTION INVARIANT HELD' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);