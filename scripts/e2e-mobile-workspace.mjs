// Phase 9 — real-browser mobile verification of the simulation workspace.
// Runs against the built production app (port 3199) using a phone viewport, and
// asserts what unit tests cannot: no horizontal overflow, working pane tabs,
// readable materials, and usable save/submit controls.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:3199';
const PHONE = { width: 390, height: 844 }; // iPhone 14 class
// Use the browser already installed on this machine (no 150MB download).
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { await (await fetch(`${BASE}/api/health`)).json(); break; } catch { await wait(500); }
}

// Register a fresh learner (the public path the UI uses) so runs are repeatable.
const email = `mobile-check-${Date.now()}@worksim.dev`;
const password = 'Mobile-Check-1';
await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Mobile Learner', email, password, locale: 'EN' }),
});

const browser = await chromium.launch({ executablePath: CHROME_PATH });
const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();

const overflow = () => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
const noOverflow = (size) => size.scrollWidth <= size.clientWidth + 1;

// 1. Sign in through the real UI.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#login-email', email);
await page.fill('#login-password', password);
await page.click('button[type=submit]');
await page.waitForURL(/dashboard/, { timeout: 15000 });
check('login works on a phone viewport', page.url().includes('dashboard'));

// 2. Enter the simulation workspace.
await page.goto(`${BASE}/simulations/novashop-mobile-checkout`, { waitUntil: 'networkidle' });
await page.click('.detail-main .button');
await page.waitForURL(/workspace/, { timeout: 15000 });
await page.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
check('workspace opens on mobile', page.url().includes('/workspace/'));
// MARKER
// 3. No horizontal overflow — the headline mobile requirement.
let size = await overflow();
check('no horizontal page overflow (Work pane)', noOverflow(size), `scrollWidth=${size.scrollWidth} clientWidth=${size.clientWidth}`);

// 4. The buggy component and the fix field are both usable on the work pane.
check('buggy component is shown in the work pane', await page.locator('.code-view').first().isVisible());
check('fix field (code textarea) is usable', await page.locator('textarea.code-input').first().isVisible());

// 5. Save + submit stay tappable (>=44px tall) on a phone.
const actions = await page.locator('.workspace-actions .button').all();
const heights = await Promise.all(actions.map((button) => button.evaluate((element) => element.getBoundingClientRect().height)));
check('save/submit buttons stay tappable', heights.length >= 2 && heights.every((height) => height >= 44),
  heights.map((height) => `${Math.round(height)}px`).join(', '));

// 6. Pane switching shows one pane at a time.
await page.click('#workspace-tab-messages');
const workHiddenOnMessages = !(await page.locator('.workspace-task .task-instructions').isVisible());
const inboxVisible = await page.locator('.workspace-inbox-pane h2').isVisible();
check('Messages tab shows the inbox and hides the work form', workHiddenOnMessages && inboxVisible);
size = await overflow();
check('no horizontal overflow (Messages pane)', noOverflow(size), `scrollWidth=${size.scrollWidth} clientWidth=${size.clientWidth}`);

await page.click('#workspace-tab-materials');
const materialsVisible = await page.locator('.workspace-materials-pane h2').isVisible();
const workHiddenOnMaterials = !(await page.locator('.workspace-task .task-instructions').isVisible());
check('Materials tab shows the desk and hides the work form', materialsVisible && workHiddenOnMaterials);

// 7. Materials are readable in place, not just titles.
const summaries = await page.locator('.workspace-materials summary').count();
check('materials are listed', summaries >= 3, `count=${summaries}`);
await page.locator('.workspace-materials summary').first().click();
const reportText = await page.locator('.material-content').first().innerText();
check('material content is readable', reportText.length > 200, `${reportText.length} chars`);

// 8. Code keeps its own formatting and scrolls internally, never the page.
const codeDetails = page.locator('.workspace-materials details').filter({ has: page.locator('.material-content.code') });
if (await codeDetails.count() > 0) {
  await codeDetails.locator('summary').first().click();
  await page.waitForSelector('.material-content.code', { timeout: 5000 });
  size = await overflow();
  check('code material scrolls internally, page does not overflow', noOverflow(size),
    `scrollWidth=${size.scrollWidth} clientWidth=${size.clientWidth}`);
}
size = await overflow();
check('no horizontal overflow (Materials pane)', noOverflow(size), `scrollWidth=${size.scrollWidth} clientWidth=${size.clientWidth}`);

// 9. Draft save round-trips through the real API from the phone UI.
await page.click('#workspace-tab-work');
await page.fill('textarea.code-input', 'useEffect(() => { setOrder(compute(cart.items)); }, [cart]);');
await page.click('.workspace-actions .button-small');
await wait(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
const restored = await page.locator('textarea.code-input').first().inputValue();
check('draft survives a reload (autosave works on mobile)', restored.includes('compute(cart.items)'), restored.slice(0, 40));

// Capture the real phone-viewport workspace (screenshot plan: 09-mobile-workspace).
await page.screenshot({ path: 'screenshots/09-mobile-workspace.png' });
check('mobile workspace screenshot captured', true, 'screenshots/09-mobile-workspace.png');

// 10. RTL: the Arabic workspace is right-to-left and does not overflow.
// The language switch persists to localStorage and rerenders in place; the app
// shell re-checks the session first, so wait for the workspace to be ready.
await page.click('.language');
await page.waitForSelector('.workspace-grid[data-pane]', { timeout: 15000 });
await page.waitForFunction(() => document.documentElement.getAttribute('dir') === 'rtl', null, { timeout: 15000 });
const rtl = await page.evaluate(() => ({ dir: document.documentElement.dir, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
check('Arabic workspace is RTL with no overflow', rtl.dir === 'rtl' && rtl.scrollWidth <= rtl.clientWidth + 1,
  `dir=${rtl.dir} ${rtl.scrollWidth}/${rtl.clientWidth}`);

await browser.close();
console.log(failures === 0 ? '\nALL MOBILE WORKSPACE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);