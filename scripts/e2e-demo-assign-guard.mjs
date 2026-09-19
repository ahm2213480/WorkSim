// Guards the production invariant: the demo switches 'auto' must resolve to
// OFF outside development, so no real deployment ever creates a mentor
// assignment or an evidence share from a request. Runs the server with
// NODE_ENV=production, mirroring scripts/smoke.mjs (which the dev-e2e script
// could not reuse because it does not return the child to drive requests).
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const BASE = 'http://127.0.0.1:3199';
const child = spawn(
  process.execPath,
  ['dist/server/index.js'],
  { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3199', COOKIE_SECURE: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] },
);
process.on('exit', () => { if (child.exitCode === null) child.kill(); });

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

// Wait until the server prints its ready line (same as smoke.mjs).
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
let spawnError;
child.on('error', (error) => { spawnError = error; });
let ready = false;
for (let i = 0; i < 100; i += 1) {
  if (spawnError) throw spawnError;
  if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
  if (output.includes('WorkSim API listening')) { ready = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!ready) throw new Error(`Server startup timed out: ${output}`);

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

const employer = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'employer@worksim.dev', password: 'Worksim-demo-1' }) });
const employerCookie = (employer.headers.get('set-cookie') ?? '').split(';')[0];
const evidence = await (await fetch(`${BASE}/api/employer/evidence?locale=EN`, { headers: { Cookie: employerCookie } })).json();
const shared = evidence.submissions?.some((entry) => entry.id === submitted.evidence?.id);
check('production does NOT auto-share with the demo employer', !shared, `visible=${!!shared}`);

console.log(failures === 0 ? '\nPRODUCTION INVARIANT HELD' : `\n${failures} CHECK(S) FAILED`);
if (child.exitCode === null) {
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
process.exit(failures === 0 ? 0 : 1);