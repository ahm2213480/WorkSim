// Phase 11 — capture the ten required screenshots from the real running
// product. Desktop 1440x900 (and one 390x844 phone shot), bilingual shots where
// the plan says so. Every shot is the real app with seeded demo data; nothing
// is mocked up. Output: screenshots/*.png + a printed capture log.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:3199';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('SEED_DEMO_PASSWORD is not set');
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const child = spawn(
  process.execPath,
  ['dist/server/index.js'],
  { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3199', COOKIE_SECURE: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] },
);
process.on('exit', () => { if (child.exitCode === null) child.kill(); });
let output = '';
child.stdout.on('data', (c) => { output += c.toString(); });
child.stderr.on('data', (c) => { output += c.toString(); });
let ready = false;
for (let i = 0; i < 100; i += 1) {
  if (output.includes('WorkSim API listening')) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) throw new Error(`Server startup timed out: ${output}`);

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard|mentor|employer|admin/, { timeout: 15000 });
}

const browser = await chromium.launch({ executablePath: CHROME_PATH });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await desktop.newPage();
const shots = [];
// The app persists the chosen language under this exact key (client/locale.tsx).
// Writing a different key silently produced a duplicate screenshot once, so the
// capture now verifies the rendered direction instead of trusting the write.
const LOCALE_KEY = 'worksim-locale';

async function shot(name, route, audience, purpose, locale = 'en') {
  await page.evaluate(([key, l]) => { localStorage.setItem(key, l); }, [LOCALE_KEY, locale]);
  if (route) await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
  // React mirrors the language onto <html dir> in an effect after mount, so
  // reading it immediately can see "" and a fixed pause is not enough under
  // load (an earlier run failed exactly there). Wait for the attribute AND for
  // React to have rendered children, then assert the value — a blank page must
  // never be captured and called evidence.
  await page
    .waitForFunction(
      (d) => document.documentElement.dir === d && (document.querySelector('#root')?.childElementCount ?? 0) > 0,
      expectedDir,
      { timeout: 15000 },
    )
    .catch(() => {});
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== expectedDir) {
    throw new Error(`${name}.png: expected dir=${expectedDir} but the page rendered dir=${dir}`);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  shots.push({ name, route: route ?? '(current)', audience, purpose, locale });
}

// 01 — landing (visitor). 02 — catalog.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await shot('01-home', null, 'Visitors', 'understand realistic job practice and the evidence model');
await shot('02-catalog', '/simulations', 'Learners', 'compare the two available simulations and filter by skill');

// Sign in as the seeded learner for the learner shots (03–06).
await login(page, 'learner@worksim.dev', DEMO_PASSWORD);
await shot('03-novashop-details', '/simulations/novashop-mobile-checkout', 'Learners', 'inspect the frontend role, brief, requirements and materials');

// 04 — NovaShop workspace with the buggy component expanded.
await page.goto(`${BASE}/simulations/novashop-mobile-checkout`, { waitUntil: 'networkidle' });
await page.click('.detail-main .button');
await page.waitForURL(/workspace/, { timeout: 15000 });
await page.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
const codeSummary = page.locator('.workspace-materials details summary').first();
if (await codeSummary.count()) await codeSummary.click().catch(() => {});
await page.waitForTimeout(400);
await shot('04-novashop-workspace', null, 'Learners', 'investigate checkout with the buggy component, inbox and fix fields');

// 05 — NovaShop evidence (deterministic evaluation + cached AI review).
const completed = await page.evaluate(async () => {
  const res = await fetch('/api/attempts?locale=EN');
  const data = await res.json();
  return (data.attempts ?? []).filter((a) => a.submissionId);
});
const nova = completed.find((a) => a.simulation.slug === 'novashop-mobile-checkout') ?? completed[0] ?? null;
if (nova) {
  await shot('05-novashop-feedback', `/evidence/${nova.submissionId}`, 'Learners', 'inspect the deterministic evaluation and cached AI review');
} else {
  console.log('SKIP 05 - no completed submission for the seeded learner');
}

// 06 — MarketFlow workspace (sales materials pane).
await page.goto(`${BASE}/simulations/marketflow-sales-decline`, { waitUntil: 'networkidle' });
await page.click('.detail-main .button');
await page.waitForURL(/workspace/, { timeout: 15000 });
await page.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
await page.click('.workspace-tabs button >> nth=2').catch(() => {});
await page.waitForTimeout(400);
await shot('06-marketflow-workspace', null, 'Learners', 'inspect the sales dataset materials and analysis fields');

// 07 — mentor review (mentor account).
await login(page, 'mentor@worksim.dev', DEMO_PASSWORD);
await page.goto(`${BASE}/mentor`, { waitUntil: 'networkidle' });
await page.waitForSelector('.attempt-list, .muted', { timeout: 15000 });
const mentorShot = page.locator('.attempt-row .button').first();
if (await mentorShot.count()) await mentorShot.click().catch(() => {});
await page.waitForTimeout(600);
await shot('07-mentor-review', null, 'Mentors', 'inspect submitted work, AI context and add human feedback');

// 08 — employer evidence (employer account).
await login(page, 'employer@worksim.dev', DEMO_PASSWORD);
await page.goto(`${BASE}/employer`, { waitUntil: 'networkidle' });
const employerShot = page.locator('.attempt-row .button').first();
if (await employerShot.count()) await employerShot.click().catch(() => {});
await page.waitForTimeout(600);
await shot('08-employer-evidence', null, 'Employers', "inspect a consenting candidate's work, evaluation and approach");

// 09 — mobile workspace (phone viewport, real capture like Phase 9).
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const ppage = await phone.newPage();
await login(ppage, 'learner@worksim.dev', DEMO_PASSWORD);
await ppage.goto(`${BASE}/simulations/novashop-mobile-checkout`, { waitUntil: 'networkidle' });
await ppage.click('.detail-main .button');
await ppage.waitForURL(/workspace/, { timeout: 15000 });
await ppage.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
await ppage.waitForTimeout(400);
await ppage.screenshot({ path: `${OUT}/09-mobile-workspace.png`, fullPage: true });
shots.push({ name: '09-mobile-workspace', route: '/workspace/:attemptId', audience: 'Learners', purpose: 'use the workspace on a phone viewport (tab strip)', locale: 'en' });

// 10 — Arabic interface (RTL core workflow: evidence page).
// Must be the LEARNER's own session: the evidence endpoint is owner-scoped, so
// capturing it as the employer (shot 08) would render a permission error.
await login(page, 'learner@worksim.dev', DEMO_PASSWORD);
const arabicRoute = nova ? `/evidence/${nova.submissionId}` : '/simulations';
await shot('10-arabic-interface', arabicRoute, 'Arabic-speaking learners', 'use a core RTL workflow (evidence page)', 'ar');

// No two screenshots may be identical: a duplicate means the capture failed
// silently (wrong session, wrong locale, cached page) and would be dishonest
// to ship as evidence of a different screen.
const { createHash } = await import('node:crypto');
const { readFileSync } = await import('node:fs');
const seen = new Map();
for (const s of shots) {
  const hash = createHash('md5').update(readFileSync(`${OUT}/${s.name}.png`)).digest('hex');
  if (seen.has(hash)) throw new Error(`${s.name}.png is byte-identical to ${seen.get(hash)}.png`);
  seen.set(hash, s.name);
}

console.log(`\nCaptured ${shots.length} screenshot(s) (all distinct):`);
for (const s of shots) console.log(`- ${s.name}.png | ${s.audience} | ${s.purpose} | route=${s.route} | locale=${s.locale}`);
await browser.close();
if (child.exitCode === null) {
  const exited = (await import('node:events')).once(child, 'exit');
  child.kill();
  await exited;
}

