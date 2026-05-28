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
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && npm install -g opencode-ai

COPY --from=builder /app/node_modules ./node_modules

# Copy Playwright browser binary and install only system deps (no re-download)
# install Chromium + all system dependencies for Playwright
RUN npx playwright install --with-deps chromium

COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright
RUN npx playwright install-deps chromium

COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./

# SQLite data lives on a volume so it survives container restarts
RUN mkdir -p /data
ENV DATABASE_URL="file:/data/dev.db"
ENV NODE_ENV=production

VOLUME ["/data"]

# apply pending migrations then start the bot
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
