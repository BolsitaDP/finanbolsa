# Single arch (arm64), built on-device — better-sqlite3 compiles a native
# addon, so this image must be built on the Raspberry Pi itself (or any
# arm64 host), not cross-compiled from an x86 machine. Keeps the full
# node_modules (including drizzle-kit) in the runtime stage rather than
# trimming to Next's "standalone" output, so `npm run db:migrate` works at
# container start without vendoring dev dependencies separately — simplicity
# over image size for a single-instance home deployment.

FROM node:22-bookworm-slim AS base
WORKDIR /app
# python3/make/g++ are needed once, to compile better-sqlite3 during `npm ci`.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts

# The SQLite file lives on a mounted volume (see docker-compose.yml), owned
# by the app user so it can create/write the .db file there on first run.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV DATABASE_URL=/app/data/finanbolsa.db

CMD ["sh", "-c", "npm run db:migrate && npm start"]
