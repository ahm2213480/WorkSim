import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Runs the compiled entry point, rather than just importing Express in a test.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = process.env.SMOKE_PORT || '3199';
const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
let spawnError;
child.on('error', (error) => { spawnError = error; });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
    if (output.includes('WorkSim API listening')) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Server startup timed out: ${output}`);
  const get = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'worksim-api' });
  const home = await get('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes('<div id="root"></div>'));
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
  assert.ok(asset, 'Built JavaScript asset must be present');
  assert.equal((await get(asset[1])).status, 200);
  const unknown = await get('/api/does-not-exist');
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
  console.log('Production HTTP smoke passed: health, HTML, JavaScript asset, API 404.');
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}
