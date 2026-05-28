# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# build tools for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable

RUN yarn install --immutable

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN yarn prisma generate

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app
RUN corepack enable

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./

# install Chromium + all system dependencies for Playwright
RUN npx playwright install --with-deps chromium

# SQLite data lives on a volume so it survives container restarts
RUN mkdir -p /data
ENV DATABASE_URL="file:/data/dev.db"
ENV NODE_ENV=production

VOLUME ["/data"]

# apply pending migrations then start the bot
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
