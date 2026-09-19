// Mentor ↔ learner feedback loop E2E (production server, port 3199).
// Covers: mentor queue contents, full submission detail + AI feedback for the
// mentor, the completed-review publication to the learner, and the pending
// state for a learner whose work no mentor has reviewed yet.
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:3199';
const child = spawn(process.execPath, ['-e', "process.env.NODE_ENV='production';process.env.PORT='3199';import('./dist/server/index.js')"], { cwd: process.cwd(), stdio: 'inherit' });
process.on('exit', () => child.kill());

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  try { await (await fetch(`${BASE}/api/health`)).json(); break; } catch { await wait(500); }
}

// 1. Mentor signs in and sees the seeded learner's submission. The dev database
// accumulates submissions from walkthroughs, so select the seeded learner
// explicitly rather than trusting queue order — the learner-ownership checks
// below only hold for that record.
const mentorCookie = await login('mentor@worksim.dev', 'Worksim-demo-1');
const queue = await (await fetch(`${BASE}/api/mentor/submissions?locale=EN`, { headers: { Cookie: mentorCookie } })).json();
const item = queue.submissions?.find((entry) => entry.learner?.name === 'Lina Learner');
check('mentor queue is populated', queue.submissions?.length >= 1, `count=${queue.submissions?.length}`);
check('seeded demo submission is queued', !!item,
  (queue.submissions ?? []).map((entry) => entry.learner?.name).join(', ').slice(0, 120));
if (!item) {
  console.log('\nSEEDED DEMO SUBMISSION MISSING FROM THE QUEUE — run `npm run db:seed`');
  process.exit(1);
}
check('queue shows learner + simulation + score + status',
  !!item && !!item.learner?.name && !!item.simulation?.title && typeof item.score?.score === 'number' && !!item.reviewStatus,
  item ? `${item.learner.name} / ${item.simulation.title} / ${item.score.score}/${item.score.maxScore} / ${item.reviewStatus}` : 'none');

// 2. Mentor detail carries the learner's full work product and AI feedback.
const detail = await (await fetch(`${BASE}/api/mentor/submissions/${item.id}?locale=EN`, { headers: { Cookie: mentorCookie } })).json();
const workKeys = detail.evidence?.work?.map((field) => field.key) ?? [];
check('mentor sees the full submitted work', workKeys.length >= 4, workKeys.join(', '));
check('mentor sees the learner evidence + evaluation', !!detail.evidence?.evaluation && (detail.evidence?.skills?.length ?? 0) > 0,
  `criteria=${detail.evidence?.evaluation?.criteria?.length} skills=${detail.evidence?.skills?.length}`);
check('mentor sees the learner AI feedback (read-only, cached)', detail.aiReview?.status === 'READY', `model=${detail.aiReview?.model}`);
check('mentor detail carries this mentor\'s review state', detail.review === null || ['DRAFT', 'COMPLETED'].includes(detail.review.status),
  detail.review?.status ?? 'none');

// 3. The learner now sees that completed review, with the reviewer's name.
const learnerCookie = await login('learner@worksim.dev', 'Worksim-demo-1');
const owned = await (await fetch(`${BASE}/api/submissions/${item.id}?locale=EN`, { headers: { Cookie: learnerCookie } })).json();
check('learner payload includes a mentorFeedback field', 'mentorFeedback' in owned, Object.keys(owned).join(', '));
check('learner sees the completed mentor feedback + reviewer name',
  owned.mentorFeedback?.reviewerName === 'Omar Mentor' && (owned.mentorFeedback?.feedback?.length ?? 0) > 0,
  owned.mentorFeedback ? `${owned.mentorFeedback.reviewerName}: ${owned.mentorFeedback.feedback.slice(0, 50)}` : 'null');
check('learner evidence still intact', !!owned.evidence?.evaluation && (owned.evidence?.work?.length ?? 0) > 0);

// 4. Pending state: a brand-new learner's submission has no review yet.
const email = `pending-learner-${Date.now()}@worksim.dev`;
const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pending Learner', email, password: 'Pending-Pass-1', locale: 'EN' }) });
const pendingCookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];
const started = await (await fetch(`${BASE}/api/simulations/novashop-mobile-checkout/start`, { method: 'POST', headers: { Cookie: pendingCookie } })).json();
const submitted = await (await fetch(`${BASE}/api/attempts/${started.attemptId}/submit`, {
  method: 'POST', headers: { Cookie: pendingCookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ work: { diagnosis: 'd', patch: 'p', testPlan: 't', estimate: 'e' } }),
})).json();
const pending = await (await fetch(`${BASE}/api/submissions/${submitted.evidence.id}`, { headers: { Cookie: pendingCookie } })).json();
check('unreviewed submission reports the pending state', pending.mentorFeedback === null, String(pending.mentorFeedback));

// 5. Isolation: a learner cannot read someone else's submission.
const foreign = await fetch(`${BASE}/api/submissions/${item.id}`, { headers: { Cookie: pendingCookie } });
check('another learner\'s submission is 404', foreign.status === 404, `status=${foreign.status}`);

console.log(failures === 0 ? '\nALL MENTOR↔LEARNER LOOP CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

