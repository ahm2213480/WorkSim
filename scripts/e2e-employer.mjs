// Phase 7 live E2E: runs against the production server (npm start, port 3199).
// Verifies the full employer journey plus authorization failures end to end.
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3199';
const PASSWORD = 'Worksim-demo-1';

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` -> ${extra}` : ''}`);
  if (!ok) failures += 1;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  return { res, cookie };
}

const main = async () => {
  // 1. Login as the seeded employer.
  const employer = await login('employer@worksim.dev');
  check('employer login', employer.res.status === 200, `status=${employer.res.status}`);

  // 2. /api/auth/me reports the EMPLOYER role.
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: employer.cookie } });
  const meBody = await me.json();
  check('me role=EMPLOYER', me.status === 200 && meBody.user?.role === 'EMPLOYER', meBody.user?.role);

  // 3. Evidence list contains the seeded consented submission. The dev database
  // is shared with manual walkthroughs (and dev auto-share), so the list can hold
  // more than the seeded entry: target the seeded learner explicitly instead of
  // assuming the list has exactly one row.
  const list = await fetch(`${BASE}/api/employer/evidence?locale=EN`, { headers: { Cookie: employer.cookie } });
  const listBody = await list.json();
  const items = listBody.submissions ?? [];
  const item = items.find((entry) => entry.learner?.name === 'Lina Learner');
  check('evidence list', list.status === 200 && items.length >= 1, `count=${items.length}`);
  check('seeded demo evidence is listed', !!item,
    items.map((entry) => entry.learner?.name).join(', ').slice(0, 120));
  if (!item) {
    // Without the seeded record the remaining checks would only test an
    // accidental row, so stop here instead of reporting misleading results.
    console.log('\nSEEDED DEMO EVIDENCE MISSING — run `npm run db:seed`');
    process.exit(1);
  }
  check('list context complete', !!item && item.learner?.name === 'Lina Learner' && item.simulation?.company === 'NovaShop'
    && typeof item.score?.score === 'number' && item.skills?.length > 0 && item.mentorReview === 'COMPLETED',
    item ? `${item.learner.name} / ${item.simulation.company} / ${item.score.score}/${item.score.maxScore} / skills=${item.skills.length} / mentor=${item.mentorReview}` : 'none');
  // 4. Evidence detail: candidate, task, work, evaluation, skills, timeline, AI, mentor.
  const detail = await fetch(`${BASE}/api/employer/evidence/${item.id}?locale=EN`, { headers: { Cookie: employer.cookie } });
  const body = await detail.json();
  const e = body.evidence ?? {};
  check('detail 200', detail.status === 200);
  check('detail candidate', e.learner?.name === 'Lina Learner');
  check('detail task + instructions', e.task?.title?.length > 0 && e.task?.instructions?.length > 0, e.task?.title);
  check('detail work fields', e.work?.length > 0 && e.work.every((f) => typeof f.value === 'string'), `fields=${e.work?.length}`);
  check('detail evaluation', e.evaluation?.score === item.score.score && e.evaluation?.criteria?.length > 0,
    `${e.evaluation?.score}/${e.evaluation?.maxScore} criteria=${e.evaluation?.criteria?.length}`);
  check('detail skills', e.skills?.length > 0, e.skills?.map((s) => s.name).join(', '));
  check('detail timeline', Array.isArray(e.timeline), `events=${e.timeline?.length}`);
  check('detail AI review READY', body.aiReview?.status === 'READY' && body.aiReview.feedback?.explanation?.length > 0,
    `model=${body.aiReview?.model}`);
  check('detail mentor feedback', body.review?.feedback?.length > 0, body.review?.feedback?.slice(0, 60));

  // 5. Arabic locale returns Arabic content (RTL data path).
  const ar = await fetch(`${BASE}/api/employer/evidence/${item.id}?locale=AR`, { headers: { Cookie: employer.cookie } });
  const arBody = await ar.json();
  check('arabic detail', ar.status === 200 && /[\u0600-\u06FF]/.test(arBody.evidence?.task?.title ?? ''), arBody.evidence?.task?.title);
  // 6. No write routes exist.
  const post = await fetch(`${BASE}/api/employer/evidence`, { method: 'POST', headers: { Cookie: employer.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  const put = await fetch(`${BASE}/api/employer/evidence/${item.id}`, { method: 'PUT', headers: { Cookie: employer.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  const del = await fetch(`${BASE}/api/employer/evidence/${item.id}`, { method: 'DELETE', headers: { Cookie: employer.cookie } });
  check('read-only surface', post.status === 404 && put.status === 404 && del.status === 404,
    `post=${post.status} put=${put.status} delete=${del.status}`);

  // 7. IDOR: another learner's submission (fresh registration) is 404.
  const learnerRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Idor Probe', email: `idor-probe-${Date.now()}@worksim.dev`, password: 'Idor-Check-1', locale: 'EN' }),
  });
  const learnerCookie = (learnerRes.headers.get('set-cookie') ?? '').split(';')[0];
  const start = await fetch(`${BASE}/api/simulations/novashop-mobile-checkout/start`, { method: 'POST', headers: { Cookie: learnerCookie } });
  const { attemptId } = await start.json();
  const submit = await fetch(`${BASE}/api/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: { Cookie: learnerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ work: { diagnosis: 'd', patch: 'p', testPlan: 't', estimate: 'e' } }),
  });
  const { evidence } = await submit.json();
  const idor = await fetch(`${BASE}/api/employer/evidence/${evidence.id}`, { headers: { Cookie: employer.cookie } });
  check('IDOR blocked (unconsented submission)', idor.status === 404, `status=${idor.status}`);
  // 8. Role gates: learner and mentor get 403; anonymous gets 401.
  const asLearner = await fetch(`${BASE}/api/employer/evidence`, { headers: { Cookie: learnerCookie } });
  const mentor = await login('mentor@worksim.dev');
  const asMentor = await fetch(`${BASE}/api/employer/evidence`, { headers: { Cookie: mentor.cookie } });
  const anonymous = await fetch(`${BASE}/api/employer/evidence`);
  check('learner 403', asLearner.status === 403, `status=${asLearner.status}`);
  check('mentor 403', asMentor.status === 403, `status=${asMentor.status}`);
  check('anonymous 401', anonymous.status === 401, `status=${anonymous.status}`);

  // 9. SPA serves /employer in production (refresh preserves the page).
  const spa = await fetch(`${BASE}/employer`, { headers: { Cookie: employer.cookie } });
  const spaText = await spa.text();
  check('SPA route /employer serves the app', spa.status === 200 && spaText.includes('id="root"'), `status=${spa.status}`);

  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => { console.error('E2E crashed:', error); process.exit(1); });
