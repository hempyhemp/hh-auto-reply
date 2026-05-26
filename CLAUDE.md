# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn dev          # run with hot reload (tsx watch)
yarn build        # compile TypeScript → dist/
yarn start        # run compiled output
yarn lint         # ESLint check
yarn lint:fix     # ESLint auto-fix
yarn db-view      # open Prisma Studio
yarn db-migrate   # create and apply a new migration (dev)
yarn db-deploy    # apply migrations in production
```

## Architecture

The bot is a single-process Node.js app (ESM) that starts polling Telegram on launch. There is no HTTP server — all user interaction is via Telegram messages and inline keyboards.

**Entry point:** `src/index.ts` — registers handlers and starts polling.

**Singletons:**
- `@bot` → `src/bot-singleton.ts` — one `TelegramBot` instance shared across all modules. The Telegram token is hardcoded here (should be moved to `.env`).
- `@prisma` → `src/prisma.ts` — one `PrismaClient` instance.

**Path aliases** (defined in `tsconfig.json`):
- `@bot` → `src/bot-singleton`
- `@prisma` → `src/prisma`
- `@/*` → `src/*`

**Feature module — `src/hh/`:**
- `bot-commands.ts` — registers all HH-related Telegram handlers. Holds an in-memory `state` object (awaitingEmail, awaitingQuery, etc.) that tracks multi-step dialog flow. This state is **not persisted** and resets on restart.
- `scraper.ts` — Playwright (headless Chromium) automation against hh.ru. Key functions: `login()` (email + OTP flow, saves cookies to DB), `getResume()` (fetches resume text from hh.ru and upserts into `Resume` table), `applyToJobs()` (searches vacancies, generates AI cover letters per vacancy). **The actual "Apply" button click is commented out** — the function currently only generates letters without submitting.

**AI — `src/openai.ts`:** Uses Groq API (`llama-3.3-70b-versatile`) via the OpenAI-compatible SDK. The Groq API key is hardcoded (should be moved to `.env`).

**Menu — `src/bot-menu.ts`:** Renders the persistent reply keyboard and handles top-level button presses (`💼 Меню`, `👤 Debug`).

## Database (Prisma + SQLite)

Schema at `prisma/schema.prisma`, DB file at `prisma/dev.db`.

| Model | Key fields |
|---|---|
| `User` | `telegramId` (BigInt, PK), `session` (hh.ru cookies as JSON string), `hhEmail`, `prompt` (AI system prompt) |
| `Resume` | `id` (hash from hh.ru URL), `data` (plain text), `telegramId` |
| `Settings` | `telegramId` (PK), `searchQuery` (default: "Vue"), `maxApplies` (default: 1) |

`telegramId` is `BigInt` — when looking up by `msg.chat.id` (which is `number`), pass it directly; Prisma handles the coercion. But in `index.ts` it is explicitly cast with `BigInt(chatId)`.

## Environment

Required variables in `.env`:
```
DATABASE_URL="file:./dev.db"
```

`OPENAI_API_KEY` is in `.env` but unused — the active Groq key is hardcoded in `src/openai.ts`.
