# HH Auto-Apply Bot

Telegram-бот для автоматизации откликов на вакансии с **hh.ru**. Авторизуется на сайте от имени пользователя, парсит вакансии по заданному запросу и генерирует персонализированное сопроводительное письмо под каждую позицию — с учётом резюме и описания вакансии.

> **Статус:** активная разработка. Генерация писем работает; финальный клик «Откликнуться» реализован, логика отклика отлажена на реальных вакансиях.

---

## Что умеет бот

- **Авторизация через OTP** — входит на hh.ru по email + одноразовый код, сессия (cookies) сохраняется в БД и переиспользуется
- **Парсинг резюме** — скачивает резюме с hh.ru после логина, сохраняет текстом в БД
- **Поиск вакансий** — по настраиваемому запросу, с лимитом откликов за сессию
- **AI-письма** — уникальное сопроводительное письмо под каждую вакансию через LLM (Llama 3.3 70B / Groq)
- **Пропуск анкет** — вакансии с опросником автоматически пропускаются и логируются
- **Авто-режим** — cron-задача (пн–пт, 10:00) для ежедневного автозапуска
- **Полное управление через Telegram** — настройки, промпт, резюме, статус — всё в чате

---

## Стек

| Слой | Технология |
|---|---|
| Runtime | Node.js 22+ · TypeScript · ESM |
| Telegram | node-telegram-bot-api (long polling) |
| Браузерная автоматизация | Playwright (headless Chromium) |
| LLM | DeepSeek V4 Flash · OpenRouter · через `@opencode-ai/sdk` |
| ORM | Prisma 6 · SQLite |
| Планировщик | node-cron |
| Контейнеризация | Docker |
| Пакетный менеджер | Yarn 4 (PnP off) |

---

## Как это работает

```
Пользователь в Telegram
        │
        ├─ /start → главное меню
        │
        ├─ Войти на hh.ru
        │     └─ Playwright открывает браузер, вводит email
        │           └─ OTP-код пользователь присылает в чат
        │                 └─ Сессия (cookies) сохраняется в БД
        │
        ├─ Выбрать резюме → Playwright парсит список резюме с hh.ru
        │
        └─ Откликнуться
              └─ Playwright ищет вакансии по запросу
                    └─ Для каждой вакансии:
                          ├─ Парсит описание (название, требования, компания)
                          ├─ Groq API генерирует письмо (резюме + описание → письмо)
                          ├─ Playwright вставляет письмо и кликает «Откликнуться»
                          └─ Отчёт в Telegram: применено / пропущено / ошибки
```

---

## AI: как генерируются письма

Используется **DeepSeek V4 Flash** через [OpenRouter](https://openrouter.ai). Интеграция реализована через `@opencode-ai/sdk` — при первом запросе бот поднимает локальный OpenCode-сервер (`localhost:4096`), при последующих переиспользует его.

Каждая сессия генерации состоит из двух шагов:

1. **Первый промпт (без ответа)** — системная инструкция + полный текст резюме
2. **Второй промпт** — описание вакансии, модель возвращает готовое письмо

Пользователь настраивает системный промпт прямо в боте через кнопку `📝 Промт`. По умолчанию модель пишет коротко, опирается только на факты из резюме и добавляет контакты в конце.

---

## Архитектура

Одиночный Node.js процесс без HTTP-сервера. Весь UI — Telegram reply-клавиатуры и inline-кнопки.

```
src/
├── index.ts              # точка входа, регистрация хендлеров
├── bot-singleton.ts      # singleton TelegramBot (@bot)
├── prisma.ts             # singleton PrismaClient (@prisma)
├── openai.ts             # Groq API через openai-sdk
└── hh/
    ├── bot-commands.ts   # маршрутизация: handler maps вместо switch
    ├── state.ts          # UserState (awaiting-флаги, cron, pending resumes)
    ├── scraper.ts        # Playwright-автоматизация hh.ru
    ├── browser.ts        # stealth-контекст, сессии, утилиты
    ├── ui.ts             # клавиатуры, escapeHtml, StatusReporter
    ├── types.ts          # общие типы
    └── handlers/
        ├── apply.ts      # запуск поиска и откликов
        ├── auth.ts       # логин, OTP-флоу
        ├── info.ts       # статус, проблемные вакансии
        ├── resume.ts     # список резюме, просмотр, выбор
        └── settings.ts   # запрос, лимит, промпт, авто-режим
```

**Path-алиасы** (tsconfig.json): `@bot`, `@prisma`, `@/*` → `src/*`

Состояние диалога (`awaitingEmail`, `awaitingQuery` и т.д.) хранится in-memory в `Map<chatId, UserState>` — сбрасывается при рестарте процесса. Персистентные данные (сессия, резюме, настройки) — только в БД.

---

## База данных

```prisma
model User {
  telegramId  BigInt    @unique
  hhEmail     String?
  session     String?   // cookies hh.ru (JSON)
  prompt      String    // системный промпт для AI
  resumes     Resume[]
  Settings    Settings?
}

model Resume {
  id          String @id   // хэш от URL резюме на hh.ru
  title       String
  data        String        // полный текст резюме
  telegramId  BigInt
}

model Settings {
  telegramId       BigInt  @id
  searchQuery      String  @default("Vue")
  maxApplies       Int     @default(1)
  selectedResumeId String?
}

model SkippedVacancy {
  telegramId  BigInt
  href        String
  title       String
  createdAt   DateTime
  // @@unique([telegramId, href])
}
```

---

## Запуск локально

### 1. Зависимости

```bash
yarn
```

### 2. Переменные окружения

Создай `.env` в корне проекта:

```env
# База данных (обязательно)
DATABASE_URL="file:./prisma/dev.db"

# Telegram Bot Token — получить у @BotFather
TG_BOT_TOKEN=1234567890:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenRouter API Key — нужен для DeepSeek V4 Flash (openrouter.ai)
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Groq API Key — legacy, в текущей версии не используется
# GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Миграции и запуск

```bash
yarn db-migrate   # создать БД и применить миграции
yarn dev          # запуск с hot reload
```

---

## Команды

```bash
yarn dev          # запуск с hot reload (tsx watch + .env)
yarn build        # компиляция TypeScript → dist/
yarn start        # запуск скомпилированного dist/index.js
yarn lint         # ESLint проверка
yarn lint:fix     # ESLint автофикс
yarn db-view      # Prisma Studio — GUI для БД
yarn db-migrate   # создать и применить миграцию (dev)
yarn db:deploy    # применить миграции без создания новых (prod)
```

---

## Docker

### Сборка

```bash
docker build -t hh-auto-apply-bot .
```

### Запуск

Создай `.env.docker`:

```env
DATABASE_URL=file:/data/dev.db
TG_BOT_TOKEN=...
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# Linux / macOS
docker run --rm --env-file .env.docker -v $(pwd)/data:/data hh-auto-apply-bot

# Windows PowerShell
docker run --rm --env-file .env.docker -v ${PWD}/data:/data hh-auto-apply-bot
```

SQLite-база сохраняется в `./data/` и переживает перезапуски контейнера.

---

## UI бота

**Главное меню**
| Кнопка | Действие |
|---|---|
| `🚀 Откликнуться` | Запустить поиск и отклики |
| `⚙️ Настройки` | Открыть меню настроек |
| `ℹ️ Информация` | Открыть меню информации |

**Настройки**
| Кнопка | Действие |
|---|---|
| `🔢 Макс. откликов` | Лимит откликов за сессию (1–50) |
| `🔍 Изменить запрос` | Поисковый запрос на hh.ru |
| `⏰ Авто` | Вкл/выкл ежедневный cron (пн–пт 10:00) |
| `📄 Выбрать резюме` | Загрузить список резюме с hh.ru |
| `📝 Промт` | Настроить системный промпт для AI |
| `🔑 Войти на hh.ru` | Авторизация (email + OTP) |

**Информация**
| Кнопка | Действие |
|---|---|
| `⚙️ Статус` | Текущие настройки и статус авторизации |
| `📋 Моё резюме` | Просмотр сохранённого резюме |
| `🚫 Проблемные вакансии` | Вакансии с анкетой (бот не может откликнуться) |
