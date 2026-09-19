-- CreateTable
CREATE TABLE "MentorAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mentorId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MentorAssignment_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MentorAssignment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MentorAssignment_learnerId_idx" ON "MentorAssignment"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "MentorAssignment_mentorId_learnerId_key" ON "MentorAssignment"("mentorId", "learnerId");
