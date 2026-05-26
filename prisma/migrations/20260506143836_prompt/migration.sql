-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session" TEXT,
    "hhEmail" TEXT,
    "prompt" TEXT NOT NULL DEFAULT 'Напиши сопроводительное письмо опираясь на резюме. Пиши грамотно и коротко, простым языком не официально. Пиши только текст самого письма, ты пишешь напрямую в компанию. Мне отвечать или делать ремарки не нужно.'
);
INSERT INTO "new_User" ("createdAt", "firstName", "hhEmail", "id", "session", "telegramId", "username") SELECT "createdAt", "firstName", "hhEmail", "id", "session", "telegramId", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
