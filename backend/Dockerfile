# Build context = repo root  (railway.json sets dockerBuildContext: ".")
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# better-sqlite3 may compile from source — keep build toolchain in this stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src

RUN npm run build && npm prune --omit=dev

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# Backend
COPY --from=builder /build/backend/node_modules ./backend/node_modules
COPY --from=builder /build/backend/dist         ./backend/dist
COPY --from=builder /build/backend/package.json ./backend/package.json

# Frontend (plain HTML — no build step needed)
COPY frontend ./frontend

COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8787
ENV FRONTEND_DIR=/app/frontend

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
