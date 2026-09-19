import 'dotenv/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Boots the built server in development (demo switches on) and verifies every
// seeded staff account can sign in. The password is read from the environment
// and NEVER printed — only PASS/FAIL per account reaches the console.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('SEED_DEMO_PASSWORD is not set');

const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3199', COOKIE_SECURE: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => { if (child.exitCode === null) child.kill(); });

let output = '';
child.stdout.on('data', (c) => { output += c.toString(); });
child.stderr.on('data', (c) => { output += c.toString(); });
let spawnError;
child.on('error', (e) => { spawnError = e; });
for (let i = 0; i < 100; i += 1) {
  if (spawnError) throw spawnError;
  if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
  if (output.includes('WorkSim API listening')) break;
  await new Promise((r) => setTimeout(r, 100));
}

const BASE = 'http://127.0.0.1:3199';
let failures = 0;
for (const [email, role, area] of [
  ['learner@worksim.dev', 'LEARNER', 'workspace'],
  ['mentor@worksim.dev', 'MENTOR', 'mentor queue'],
  ['employer@worksim.dev', 'EMPLOYER', 'candidate evidence'],
  ['admin@worksim.dev', 'ADMIN', 'admin area'],
]) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  const ok = res.status === 200 && body.user?.role === role;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${email} -> role=${body.user?.role ?? res.status} (opens: ${area})`);
  if (!ok) failures += 1;
}
console.log(failures === 0 ? '\nALL DEMO ACCOUNTS SIGN IN' : `\n${failures} ACCOUNT(S) FAILED`);
if (child.exitCode === null) {
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
process.exit(failures === 0 ? 0 : 1);
