import 'dotenv/config';
import { prisma } from './db.js';
import { getEnv } from './env.js';
import { hashPassword } from './auth/passwords.js';

// Demo accounts for local development and the assessment demo. Public
// registration only ever creates learners; staff accounts exist so the mentor,
// employer and admin flows can be demonstrated. Passwords come from .env
// (SEED_DEMO_PASSWORD) and must be changed or disabled in a real deployment.
const accounts = [
  { email: 'learner@worksim.dev', name: 'Lina Learner', role: 'LEARNER', locale: 'EN' },
  { email: 'mentor@worksim.dev', name: 'Omar Mentor', role: 'MENTOR', locale: 'EN' },
  { email: 'employer@worksim.dev', name: 'Elena Employer', role: 'EMPLOYER', locale: 'EN' },
  { email: 'admin@worksim.dev', name: 'Adam Admin', role: 'ADMIN', locale: 'EN' },
];

const passwordHash = hashPassword(getEnv().SEED_DEMO_PASSWORD);

for (const account of accounts) {
  await prisma.user.upsert({
    where: { email: account.email },
    update: {}, // Keep any changes made through the app after first seeding.
    create: { ...account, passwordHash },
  });
  console.log(`Seeded ${account.role} account: ${account.email}`);
}

await prisma.$disconnect();
