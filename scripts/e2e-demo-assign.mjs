// Dev/demo auto-assignment E2E: boots the server with NODE_ENV=development so
// DEMO_AUTO_ASSIGN_MENTOR resolves to its 'auto' default (on), then proves that
// an account registered through the public endpoint becomes reviewable in the
// mentor queue as soon as it submits.
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:3199';
const child = spawn(
  process.execPath,
  ['-e', "process.env.NODE_ENV='development';process.env.PORT='3199';import('./dist/server/index.js')"],
  { cwd: process.cwd(), stdio: 'inherit' },
);
process.on('exit', () => child.kill());

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function login(email, password = 'Worksim-demo-1') {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  try { await (await fetch(`${BASE}/api/health`)).json(); break; } catch { await wait(500); }
}

// 1. Register a brand-new learner through the public endpoint (as the UI does).
const email = `demo-assign-${Date.now()}@worksim.dev`;
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Demo Assignee', email, password: 'Demo-Assign-1', locale: 'EN' }),
});
const registered = await reg.json();
const learnerCookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];
check('new learner registers as LEARNER', reg.status === 201 && registered.user?.role === 'LEARNER', registered.user?.role);

// 2. Submit a NovaShop task from that new account.
const started = await (await fetch(`${BASE}/api/simulations/novashop-mobile-checkout/start`, { method: 'POST', headers: { Cookie: learnerCookie } })).json();
const submitted = await (await fetch(`${BASE}/api/attempts/${started.attemptId}/submit`, {
  method: 'POST',
  headers: { Cookie: learnerCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    work: {
      diagnosis: 'The effect depends only on cart.items.length, so the total keeps a stale reference on first render.',
      patch: 'useEffect(() => { setOrder(...) }, [cart]);',
      testPlan: '1. Phone viewport: total is correct. 2. Change quantity: total matches. 3. Guest checkout works. 4. Desktop regression at 1280px.',
      estimate: 'About 4 hours.',
    },
  }),
})).json();
check('new learner submits successfully', !!submitted.evidence?.id, `submission=${submitted.evidence?.id?.slice(0, 8)}`);

// 3. The demo mentor's queue now contains that submission.
const mentorCookie = await login('mentor@worksim.dev');
const queue = await (await fetch(`${BASE}/api/mentor/submissions?locale=EN`, { headers: { Cookie: mentorCookie } })).json();
const item = queue.submissions?.find((entry) => entry.id === submitted.evidence?.id);
check('submission appears in the mentor queue', !!item,
  item ? `${item.learner.name} / ${item.simulation.title} / ${item.reviewStatus}` : `queue=${queue.submissions?.length} items`);
check('queue item identifies the new learner', item?.learner?.name === 'Demo Assignee', item?.learner?.name);

// 4. And it is reviewable end to end.
const detail = await fetch(`${BASE}/api/mentor/submissions/${submitted.evidence?.id}?locale=EN`, { headers: { Cookie: mentorCookie } });
check('mentor can open the new submission', detail.status === 200, `status=${detail.status}`);

console.log(failures === 0 ? '\nALL DEMO AUTO-ASSIGNMENT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);