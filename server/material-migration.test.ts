import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';

it('migrates existing materials without losing text, relationships or ordering', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'worksim-migration-'));
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'upgrade.db').split(path.sep).join('/')}` } } });
  async function applyMigration(name: string) {
    const sql = readFileSync(path.resolve('prisma/migrations', name, 'migration.sql'), 'utf8');
    // These checked-in migrations contain no semicolons inside SQL literals.
    for (const statement of sql.split(';').filter((part) => part.trim())) {
      await db.$executeRawUnsafe(statement);
    }
  }
  try {
    await applyMigration('20260917000100_foundation');
    await db.$executeRaw`INSERT INTO "Simulation" ("id", "slug", "company", "roleTitleEn", "roleTitleAr", "titleEn", "titleAr", "summaryEn", "summaryAr", "briefEn", "briefAr", "estimatedMinutes", "updatedAt") VALUES ('migration-sim', 'migration-sim', 'NovaShop', 'Developer', 'مطور', 'Checkout', 'الدفع', 'Mobile checkout', 'الدفع عبر الهاتف', 'Investigate', 'تحقق', 45, CURRENT_TIMESTAMP)`;
    const content = 'Legacy report / تقرير قديم\nKeep every character.';
    await db.$executeRaw`INSERT INTO "SimulationMaterial" ("id", "simulationId", "kind", "titleEn", "titleAr", "content", "order") VALUES ('migration-material', 'migration-sim', 'BUG_REPORT', 'Report', 'تقرير', ${content}, 2)`;
    await applyMigration('20260917000200_bilingual_materials');
    const rows = await db.$queryRaw<Array<{ contentEn: string; contentAr: string; order: number; simulationId: string }>>`SELECT "contentEn", "contentAr", "order", "simulationId" FROM "SimulationMaterial"`;
    expect(rows).toEqual([{ contentEn: content, contentAr: content, order: 2, simulationId: 'migration-sim' }]);
    expect(await db.$queryRawUnsafe('PRAGMA foreign_key_check')).toEqual([]);
    await db.$executeRaw`DELETE FROM "Simulation" WHERE "id" = 'migration-sim'`;
    expect(await db.$queryRaw`SELECT "id" FROM "SimulationMaterial"`).toEqual([]);
  } finally {
    await db.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
