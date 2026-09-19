import { prisma } from '../db.js';

/** The demo mentor provisioned by `npm run db:seed`. */
export const DEMO_MENTOR_EMAIL = 'mentor@worksim.dev';

/** Dev/demo convenience: make a mentor-less learner reviewable by the seeded
 *  demo mentor, so a freshly registered account's submission shows up in the
 *  mentor queue during a walkthrough.
 *
 *  The production rule is unchanged: `MentorAssignment` is provisioned by
 *  seeding or an admin action only, never from client input (see the model
 *  comment in schema.prisma). This helper is called exclusively when the
 *  dev/demo switch is on, and it is deliberately conservative:
 *  - it does nothing when the demo mentor is absent (a real deployment);
 *  - it never replaces an existing assignment, so a learner an admin already
 *    provisioned is not hijacked by the demo default.
 *  Review access remains scoped: the queue still filters by assignment, so the
 *  learner becomes visible only to the mentor actually assigned here. */
export async function ensureDemoMentorAssignment(learnerId: string): Promise<void> {
  const mentor = await prisma.user.findUnique({
    where: { email: DEMO_MENTOR_EMAIL },
    select: { id: true, role: true },
  });
  if (!mentor || mentor.role !== 'MENTOR') return;

  const existing = await prisma.mentorAssignment.findFirst({ where: { learnerId }, select: { id: true } });
  if (existing) return;

  await prisma.mentorAssignment.upsert({
    where: { mentorId_learnerId: { mentorId: mentor.id, learnerId } },
    update: {},
    create: { mentorId: mentor.id, learnerId },
  });
}