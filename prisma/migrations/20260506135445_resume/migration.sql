-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    CONSTRAINT "Resume_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "User" ("telegramId") ON DELETE CASCADE ON UPDATE CASCADE
);
