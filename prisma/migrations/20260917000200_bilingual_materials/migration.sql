-- Preserve existing material text in both locales as a legacy fallback.
-- Copying text is not translation: narrative materials must be authored in Arabic.
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE "new_SimulationMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "contentEn" TEXT NOT NULL,
    "contentAr" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "SimulationMaterial_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SimulationMaterial" ("id", "simulationId", "kind", "titleEn", "titleAr", "contentEn", "contentAr", "order")
SELECT "id", "simulationId", "kind", "titleEn", "titleAr", "content", "content", "order" FROM "SimulationMaterial";
DROP TABLE "SimulationMaterial";
ALTER TABLE "new_SimulationMaterial" RENAME TO "SimulationMaterial";
CREATE INDEX "SimulationMaterial_simulationId_idx" ON "SimulationMaterial"("simulationId");
COMMIT;
PRAGMA foreign_keys=ON;
