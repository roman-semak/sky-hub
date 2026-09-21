# syntax=docker/dockerfile:1.7
# SkyTrace API + ingest worker (Fly.io). Optionally also serves the web build
# (WEB_DIST) so the whole app can run as a single container.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/adsb-types/package.json packages/adsb-types/
COPY packages/geo/package.json packages/geo/
COPY packages/protocol/package.json packages/protocol/
COPY packages/static-data/package.json packages/static-data/
COPY scripts/package.json scripts/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm turbo run build --filter=@skytrace/server... --filter=@skytrace/web
# Self-contained server with only production dependencies.
RUN pnpm --filter @skytrace/server deploy --legacy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    HISTORY_DIR=/data/history \
    STATIC_DATA_PATH=/app/data/static/datasets.json.zst \
    WEB_DIST=/app/web
WORKDIR /app/server
COPY --from=build /out ./
COPY --from=build /repo/data/static /app/data/static
COPY --from=build /repo/apps/web/dist/web/browser /app/web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "dist/main.js"]
