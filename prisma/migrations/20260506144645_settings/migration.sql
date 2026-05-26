-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramId" BIGINT NOT NULL,
    "searchQuery" TEXT NOT NULL DEFAULT 'Vue',
    "maxApplies" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Settings_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User" ("telegramId") ON DELETE CASCADE ON UPDATE CASCADE
);
