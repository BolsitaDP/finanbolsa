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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts

# Runs as root (default) rather than a dedicated non-root user: the SQLite
# file lives on a host-mounted volume (see docker-compose.yml), and matching
# a non-root container user's UID to whatever owns that folder on the Pi's
# filesystem is a permissions headache with no real payoff for a single
# personal container on a LAN. src/db/index.ts creates the directory itself
# if it's missing either way.

EXPOSE 3000
ENV PORT=3000
ENV DATABASE_URL=/app/data/finanbolsa.db

CMD ["sh", "-c", "npm run db:migrate && npm start"]
