import { prisma } from '../db.js';

/** The demo employer provisioned by `npm run db:seed`. */
export const DEMO_EMPLOYER_EMAIL = 'employer@worksim.dev';

/** Dev/demo convenience: make a freshly registered learner's work visible to the
 *  seeded demo employer, so a walkthrough submission shows up in the employer
 *  evidence list as soon as it is submitted.
 *
 *  The production rule is unchanged: `EvidenceShare` is consent-based and is
 *  never created from client input (see the model comment in schema.prisma).
 *  This helper is called exclusively when the dev/demo switch is on, and it is
 *  deliberately conservative:
 *  - it does nothing when the demo employer is absent (a real deployment);
 *  - it never touches an existing row, so a learner who revoked access is not
 *    re-subscribed by submitting again — `update: {}` preserves `revokedAt`.
 *  Visibility remains scoped: the employer queries still filter by the active
 *  grant, so the learner becomes visible only to the employer granted here. */
export async function ensureDemoEvidenceShare(learnerId: string): Promise<void> {
  const employer = await prisma.user.findUnique({
    where: { email: DEMO_EMPLOYER_EMAIL },
    select: { id: true, role: true },
  });
  if (!employer || employer.role !== 'EMPLOYER') return;

  await prisma.evidenceShare.upsert({
    where: { learnerId_employerId: { learnerId, employerId: employer.id } },
    update: {},
    create: { learnerId, employerId: employer.id },
  });
}
