import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Runs once before the whole suite. Tests must never touch the development
// database: they get a throwaway SQLite file whose schema is applied from the
// committed migrations with `prisma migrate deploy` — the exact SQL that
// production runs. Each test file also sets the same DATABASE_URL through
// server/test-env.ts, because this setup process and test workers are separate.
export function setup(): void {
  const databasePath = path.resolve('prisma/test.db');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(databasePath + suffix); } catch { /* first run: nothing to remove */ }
  }
  const databaseUrl = `file:${databasePath.split(path.sep).join('/')}`;
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: databaseUrl } });
  process.env.DATABASE_URL = databaseUrl;
}