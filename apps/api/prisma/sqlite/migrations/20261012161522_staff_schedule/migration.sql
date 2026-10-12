-- CreateTable
CREATE TABLE "StaffSchedulePeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffSchedulePeriod_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "headline" TEXT NOT NULL DEFAULT '',
    "sinceYear" INTEGER,
    "chairLabel" TEXT,
    "serviceCommissionBps" INTEGER NOT NULL DEFAULT 5500,
    "productCommissionBps" INTEGER NOT NULL DEFAULT 1500,
    "customHours" BOOLEAN NOT NULL DEFAULT false,
    "weeklyHours" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffProfile" ("chairLabel", "createdAt", "headline", "productCommissionBps", "serviceCommissionBps", "sinceYear", "updatedAt", "userId") SELECT "chairLabel", "createdAt", "headline", "productCommissionBps", "serviceCommissionBps", "sinceYear", "updatedAt", "userId" FROM "StaffProfile";
DROP TABLE "StaffProfile";
ALTER TABLE "new_StaffProfile" RENAME TO "StaffProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StaffSchedulePeriod_barberId_startsAt_idx" ON "StaffSchedulePeriod"("barberId", "startsAt");
