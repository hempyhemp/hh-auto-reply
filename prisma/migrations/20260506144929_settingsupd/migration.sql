/*
  Warnings:

  - The primary key for the `Settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "telegramId" BIGINT NOT NULL PRIMARY KEY,
    "searchQuery" TEXT NOT NULL DEFAULT 'Vue',
    "maxApplies" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Settings_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User" ("telegramId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("maxApplies", "searchQuery", "telegramId") SELECT "maxApplies", "searchQuery", "telegramId" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
