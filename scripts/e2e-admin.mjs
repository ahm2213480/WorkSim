// Live admin-catalog E2E against the built server in production mode.
// Proves the role gate end-to-end over HTTP: 401 anonymous, 403 learner,
// admin creates + reads + edits + toggles a real simulation, and the
// deactivated simulation disappears from the public catalog. The demo
// password comes from .env (dotenv) and is never printed.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('SEED_DEMO_PASSWORD is not set');
const BASE = 'http://127.0.0.1:3199';
const child = spawn(
  process.execPath,
  ['dist/server/index.js'],
  { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3199', COOKIE_SECURE: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] },
);
process.on('exit', () => { if (child.exitCode === null) child.kill(); });

let output = '';
child.stdout.on('data', (c) => { output += c.toString(); });
child.stderr.on('data', (c) => { output += c.toString(); });
let spawnError;
child.on('error', (e) => { spawnError = e; });
let ready = false;
for (let i = 0; i < 100; i += 1) {
  if (spawnError) throw spawnError;
  if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
  if (output.includes('WorkSim API listening')) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) throw new Error(`Server startup timed out: ${output}`);

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}
async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

// 1. Role gate over real HTTP.
const anon = await fetch(`${BASE}/api/admin/simulations`);
check('anonymous list is 401', anon.status === 401, `status=${anon.status}`);

const learnerReg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Admin E2E', email: `admin-e2e-${Date.now()}@worksim.dev`, password: 'Admin-E2e-1', locale: 'EN' }),
});
const learnerCookie = (learnerReg.headers.get('set-cookie') ?? '').split(';')[0];
const denied = await fetch(`${BASE}/api/admin/simulations`, { headers: { Cookie: learnerCookie } });
check('learner list is 403', denied.status === 403, `status=${denied.status}`);

// 2. Admin CRUD on a real simulation.
const adminCookie = await login('admin@worksim.dev');
const slug = `e2e-admin-${Date.now()}`;
const created = await fetch(`${BASE}/api/admin/simulations`, {
  method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug, company: 'E2E Co', roleTitleEn: 'Tester', roleTitleAr: 'مختبِر',
    titleEn: 'E2E sim', titleAr: 'محاكاة E2E',
    summaryEn: 'Live check.', summaryAr: 'تحقق حي.',
    briefEn: 'Brief.', briefAr: 'موجز.',
    estimatedMinutes: 30, sortOrder: 99, isActive: true,
  }),
});
const createdBody = await created.json();
check('admin creates a simulation', created.status === 201 && createdBody.slug === slug, `status=${created.status}`);

const detail = await fetch(`${BASE}/api/admin/simulations/${slug}`, { headers: { Cookie: adminCookie } });
const detailBody = await detail.json();
check('admin reads the detail', detail.status === 200 && detailBody.simulation?.titleEn === 'E2E sim', `status=${detail.status} title=${detailBody.simulation?.titleEn ?? '?'}`);

const edited = await fetch(`${BASE}/api/admin/simulations/${slug}`, {
  method: 'PUT', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug, company: 'E2E Co', roleTitleEn: 'Tester', roleTitleAr: 'مختبِر',
    titleEn: 'E2E sim (renamed)', titleAr: 'محاكاة E2E',
    summaryEn: 'Live check.', summaryAr: 'تحقق حي.',
    briefEn: 'Brief.', briefAr: 'موجز.',
    estimatedMinutes: 30, sortOrder: 99, isActive: true,
  }),
});
check('admin edits the simulation', edited.status === 200, `status=${edited.status}`);

// 3. Deactivate → hidden from the public catalog.
const off = await fetch(`${BASE}/api/admin/simulations/${slug}/active`, {
  method: 'PATCH', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ isActive: false }),
});
const publicList = await (await fetch(`${BASE}/api/simulations?locale=EN`)).json();
check('deactivation hides it from the public catalog',
  off.status === 200 && !publicList.simulations.some((s) => s.slug === slug));

console.log(failures === 0 ? '\nALL ADMIN E2E CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
if (child.exitCode === null) {
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
process.exit(failures === 0 ? 0 : 1);
