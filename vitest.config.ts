import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'client/**/*.test.ts'],
    globalSetup: ['server/test-setup.ts'],
    // One worker, sequential files: SQLite is a single-file database, so
    // parallel writers would fight over file locks. The suite is small;
    // determinism is worth more than parallelism here.
    // (Vitest 4: poolOptions was removed; fileParallelism is the top-level option.)
    pool: 'forks',
    fileParallelism: false,
  },
});
