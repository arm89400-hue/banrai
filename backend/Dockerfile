# Built from the repository root (it needs backend/ and db/):
#   docker build -f backend/Dockerfile --target app .
#   docker build -f backend/Dockerfile --target migrator .

# 1) Production dependencies only
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) Shared base: dependencies, owned by the non-root "node" user
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./

# 3) Migrator: brings the database up to date, then exits
FROM base AS migrator
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node db ./db
USER node
CMD ["node", "scripts/migrate.js"]

# 4) App (default target): the API server
FROM base AS app
COPY --chown=node:node backend/src ./src
RUN mkdir -p /app/uploads && chown node:node /app/uploads
ENV PORT=4000 HOST=0.0.0.0 UPLOAD_DIR=/app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/index.js"]
