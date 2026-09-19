import 'dotenv/config';
import { prisma } from './db.js';
import { getEnv } from './env.js';
import { hashPassword } from './auth/passwords.js';
import { syncCatalog } from './simulations/sync.js';
import { deliverDueEvents, startOrResumeAttempt } from './attempts/service.js';
import { parseRubric, parseTaskFields, type Rubric, type TaskFieldDef } from './evaluation/rubric.js';
import { recordSubmission } from './submissions/service.js';
import { REVIEW_PROMPT_VERSION, type ReviewFeedback } from './ai/schemas.js';

// Demo accounts for local development and the assessment walkthrough. Public
// registration only ever creates learners; staff accounts exist so the mentor,
// employer and admin flows can be demonstrated. The password comes from
// SEED_DEMO_PASSWORD in .env and must be changed (or these accounts removed)
// before any real deployment.
const accounts = [
  { email: 'learner@worksim.dev', name: 'Lina Learner', role: 'LEARNER', locale: 'EN' },
  { email: 'mentor@worksim.dev', name: 'Omar Mentor', role: 'MENTOR', locale: 'EN' },
  { email: 'employer@worksim.dev', name: 'Elena Employer', role: 'EMPLOYER', locale: 'EN' },
  { email: 'admin@worksim.dev', name: 'Adam Admin', role: 'ADMIN', locale: 'EN' },
];

const passwordHash = hashPassword(getEnv().SEED_DEMO_PASSWORD);

const seeded = new Map<string, { id: string }>();
for (const account of accounts) {
  const user = await prisma.user.upsert({
    where: { email: account.email },
    update: {}, // Keep profile changes made through the app after first seeding.
    create: { ...account, passwordHash },
  });
  seeded.set(account.email, user);
  console.log(`Seeded ${account.role} account: ${account.email}`);
}

// Demo scoping for the mentor review workflow: the seeded mentor reviews the
// seeded learner. Real assignments are provisioned by admins, never via the API.
const mentor = seeded.get('mentor@worksim.dev');
const learner = seeded.get('learner@worksim.dev');
if (mentor && learner) {
  await prisma.mentorAssignment.upsert({
    where: { mentorId_learnerId: { mentorId: mentor.id, learnerId: learner.id } },
    update: {},
    create: { mentorId: mentor.id, learnerId: learner.id },
  });
    console.log('Seeded mentor assignment: mentor@worksim.dev -> learner@worksim.dev');
}

const DEMO_SIMULATION_SLUG = 'novashop-mobile-checkout';

// A canned, read-only EN review cached against the seeded submission so the
// mentor's AI panel renders realistic content without an AI provider
// configured. The mentor UI only ever reads READY rows; this never triggers
// generation and is intentionally marked with a "seed:demo" model.
const DEMO_REVIEW: ReviewFeedback = {
  strengths: [
    'Pinpoints the stale-reference race to the effect missing cart.items in its dependency array',
    'Patch recomputes the total from the current cart and guards the empty-cart case',
  ],
  areas_to_improve: [
    'Uses formatMoney(0) as the empty sentinel; a named ZERO constant would be safer across currencies',
  ],
  actionable_recommendations: [
    'Move the total computation into the array-reduce initializer so it can never read a stale cart reference',
    'Add a phone-viewport regression mirroring the desktop coverage',
  ],
  explanation:
    'The submission locates the mobile-only checkout defect to a dependency-missing effect, supplies a minimal patch that recomputes the total from the current cart, and proposes a verification plan covering phone and desktop viewports.',
};

const DEMO_MENTOR_FEEDBACK =
  'Strong diagnosis: the write-up traces the stale total to the effect dependency, and the patch is minimal and safe. ' +
  'The test plan covers phone and guest flows; add the desktop regression at 1280px and a named constant for the ' +
  'empty-cart sentinel before we close this. Clear communication, and the estimate was realistic.';

/** Builds a submission field payload that satisfies every objective rubric
 *  criterion for a task, derived from the task's own rubric rather than a
 *  hardcoded answer - so it stays valid if the seeded content changes. */
function satisfyingSubmissionWork(rubric: Rubric, fields: TaskFieldDef[]): Record<string, string> {
  const work: Record<string, string> = {};
  for (const field of fields) work[field.key] = '';
  for (const criterion of rubric.criteria) {
    const field = criterion.check.field;
    const value = work[field] ?? '';
    let next = value;
    switch (criterion.check.kind) {
      case 'nonEmpty':
        next = value || 'Addressed.';
        break;
      case 'minLength': {
        const min = criterion.check.min ?? 1;
        if (next.length < min) next += 'x'.repeat(min - next.length);
        break;
      }
      case 'hasNumber':
        next = /\p{Nd}/u.test(next) ? next : `${next || 'Value'} 3`.trim();
        break;
      case 'includesAny': {
        const values = criterion.check.values ?? [];
        if (!next) next = values[0] ?? '';
        break;
      }
      case 'includesAll': {
        const values = criterion.check.values ?? [];
        let acc = next;
        for (const signal of values) if (!acc.toLowerCase().includes(signal.toLowerCase())) acc += ` ${signal}`;
        next = acc;
        break;
      }
    }
    work[field] = next.trim();
  }
  // Required fields must not be empty after rubric-driven filling.
  for (const field of fields) if (field.required && !(work[field.key] ?? '').trim()) work[field.key] = 'Addressed.';
  return work;
}

/** Creates one demo submission for the seeded learner (NovaShop) so the seeded
 *  mentor has a realistic assigned item in their queue. Idempotent: a demo
 *  submission already present on a re-seed is left in place. */
async function seedDemoSubmission(learnerId: string, simulationSlug: string): Promise<string | null> {
  const simulation = await prisma.simulation.findUnique({
    where: { slug: simulationSlug },
    include: { tasks: { orderBy: { order: 'asc' }, take: 1 } },
  });
  if (!simulation?.tasks[0]) {
    console.warn(`Seed: skipping demo submission - simulation "${simulationSlug}" is missing or has no task.`);
    return null;
  }
  const task = simulation.tasks[0];

  const existing = await prisma.simulationAttempt.findUnique({
    where: { userId_taskId: { userId: learnerId, taskId: task.id } },
    include: { submission: { select: { id: true } } },
  });
  if (existing?.submission) {
    console.log(`Seed: demo submission already exists for ${simulationSlug}`);
    return existing.submission.id;
  }

  const attemptId = await startOrResumeAttempt(learnerId, simulationSlug);
  await deliverDueEvents(attemptId);
  const attempt = await prisma.simulationAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { eventDeliveries: { include: { event: true } }, task: true },
  });
  const deliveredKeys = new Set(attempt.eventDeliveries.map((delivery) => delivery.event.key));
  const fields = parseTaskFields(task.fieldsJson);
  const rubric = parseRubric(task.checklistJson);
  const work = satisfyingSubmissionWork(rubric, fields);
  const recorded = await recordSubmission(attempt, work, deliveredKeys);
  console.log(`Seed: created demo submission for ${simulationSlug} - score ${recorded.score}/${recorded.maxScore}`);

  await prisma.aIFeedback.upsert({
    where: { submissionId_locale: { submissionId: recorded.submissionId, locale: 'EN' } },
    create: {
      submissionId: recorded.submissionId,
      locale: 'EN',
      status: 'READY',
      inputHash: 'seed-demo',
      promptVersion: REVIEW_PROMPT_VERSION,
      model: 'seed:demo',
      feedbackJson: JSON.stringify(DEMO_REVIEW),
      completedAt: new Date(),
    },
    update: {
      status: 'READY',
      inputHash: 'seed-demo',
      promptVersion: REVIEW_PROMPT_VERSION,
      model: 'seed:demo',
      feedbackJson: JSON.stringify(DEMO_REVIEW),
      failureCode: null,
      completedAt: new Date(),
    },
  });

  return recorded.submissionId;
}

const summary = await syncCatalog();
console.log(`Seeded ${summary.skills} skills and ${summary.simulations} simulations`);

const submissionId = learner ? await seedDemoSubmission(learner.id, DEMO_SIMULATION_SLUG) : null;
const employer = seeded.get('employer@worksim.dev');

// Demo path for the employer evidence workflow: the learner grants the seeded
// employer access to their evidence (EvidenceShare is consent-based; no grant,
// no data — enforced inside every employer query). Idempotent on re-seed.
if (learner && employer && submissionId) {
  await prisma.evidenceShare.upsert({
    where: { learnerId_employerId: { learnerId: learner.id, employerId: employer.id } },
    // A re-seed re-activates the demo grant, but never revokes a live one.
    update: { revokedAt: null },
    create: { learnerId: learner.id, employerId: employer.id },
  });
  console.log('Seeded evidence share: learner@worksim.dev -> employer@worksim.dev');
}

// A completed human review on the demo submission so the employer evidence page
// shows its mentor-feedback section with real persisted content.
if (mentor && submissionId) {
  await prisma.mentorReview.upsert({
    where: { submissionId_mentorId: { submissionId, mentorId: mentor.id } },
    update: { feedback: DEMO_MENTOR_FEEDBACK, status: 'COMPLETED' },
    create: { submissionId, mentorId: mentor.id, feedback: DEMO_MENTOR_FEEDBACK, status: 'COMPLETED' },
  });
  console.log('Seeded completed mentor review on the demo submission');
}

await prisma.$disconnect();
