-- Phase 2 (learner core) schema changes.
--
-- 1. SimulationAttempt.taskSnapshotJson freezes the brief the learner received,
--    so evidence stays truthful if an admin later edits the task.
-- 2. SimulationEvent.key gives every authored event a stable handle. Rubric
--    criteria reference this key instead of a cuid, which keeps the rubric
--    readable and survives re-seeding.
-- 3. Unique indexes let the seed upsert content idempotently
--    (SimulationTask by simulation+order, SimulationEvent by simulation+key)
--    without deleting rows that attempts already point at.
--
-- The INSERT ... SELECT statements intentionally omit `key`: the event table is
-- content-only and empty before this migration, because simulation events are
-- created by `npm run db:seed` from the catalog in server/simulations. Nothing
-- is lost by the copy.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SimulationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "draftJson" TEXT NOT NULL DEFAULT '{}',
    "taskSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedAt" DATETIME,
    "submittedAt" DATETIME,
    CONSTRAINT "SimulationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimulationAttempt_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimulationAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SimulationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SimulationAttempt" ("createdAt", "draftJson", "id", "lastSavedAt", "simulationId", "status", "submittedAt", "taskId", "userId") SELECT "createdAt", "draftJson", "id", "lastSavedAt", "simulationId", "status", "submittedAt", "taskId", "userId" FROM "SimulationAttempt";
DROP TABLE "SimulationAttempt";
ALTER TABLE "new_SimulationAttempt" RENAME TO "SimulationAttempt";
CREATE INDEX "SimulationAttempt_simulationId_idx" ON "SimulationAttempt"("simulationId");
CREATE UNIQUE INDEX "SimulationAttempt_userId_taskId_key" ON "SimulationAttempt"("userId", "taskId");
CREATE TABLE "new_SimulationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromRole" TEXT,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "triggerMinutes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "SimulationEvent_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SimulationEvent" ("bodyAr", "bodyEn", "fromName", "fromRole", "id", "kind", "order", "simulationId", "titleAr", "titleEn", "triggerMinutes") SELECT "bodyAr", "bodyEn", "fromName", "fromRole", "id", "kind", "order", "simulationId", "titleAr", "titleEn", "triggerMinutes" FROM "SimulationEvent";
DROP TABLE "SimulationEvent";
ALTER TABLE "new_SimulationEvent" RENAME TO "SimulationEvent";
CREATE INDEX "SimulationEvent_simulationId_idx" ON "SimulationEvent"("simulationId");
CREATE UNIQUE INDEX "SimulationEvent_simulationId_key_key" ON "SimulationEvent"("simulationId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SimulationTask_simulationId_order_key" ON "SimulationTask"("simulationId", "order");