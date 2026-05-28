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
    "prompt" TEXT NOT NULL DEFAULT 'Ты — помощник по написанию сопроводительных писем. Отвечай только текстом самого письма, без вступлений, ремарок и пояснений. Опирайся на резюме и ничего не выдумывай, чего недостаточно в резюме лучше умолчать. Пиши по короче и простыми словами. В конце письма оставляй все контакты для связи.'
);
INSERT INTO "new_User" ("createdAt", "firstName", "hhEmail", "id", "prompt", "session", "telegramId", "username") SELECT "createdAt", "firstName", "hhEmail", "id", "prompt", "session", "telegramId", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
