# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable

RUN yarn install --immutable

# Download Chromium into /root/.cache/ms-playwright (with deps for builder OS)
RUN npx playwright install --with-deps chromium

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

# Copy pre-downloaded browser binary, then install only system deps (no re-download)
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright
RUN npx playwright install-deps chromium

COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./

RUN mkdir -p /data
ENV DATABASE_URL="file:/data/dev.db"
ENV NODE_ENV=production

VOLUME ["/data"]

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
