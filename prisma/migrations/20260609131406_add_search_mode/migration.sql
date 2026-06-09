-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "telegramId" BIGINT NOT NULL PRIMARY KEY,
    "searchQuery" TEXT NOT NULL DEFAULT 'Vue',
    "maxApplies" INTEGER NOT NULL DEFAULT 1,
    "selectedResumeId" TEXT,
    "searchMode" TEXT NOT NULL DEFAULT 'text',
    CONSTRAINT "Settings_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User" ("telegramId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("maxApplies", "searchQuery", "selectedResumeId", "telegramId") SELECT "maxApplies", "searchQuery", "selectedResumeId", "telegramId" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
