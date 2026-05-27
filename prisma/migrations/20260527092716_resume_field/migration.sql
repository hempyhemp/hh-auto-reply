-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Resume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "telegramId" BIGINT NOT NULL,
    CONSTRAINT "Resume_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User" ("telegramId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Resume" ("data", "id", "telegramId") SELECT "data", "id", "telegramId" FROM "Resume";
DROP TABLE "Resume";
ALTER TABLE "new_Resume" RENAME TO "Resume";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
