# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY games/mtg/package.json games/mtg/
COPY games/pokemon/package.json games/pokemon/
COPY connectors/obs/package.json connectors/obs/

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --ignore-scripts

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --ignore-scripts
COPY . .
RUN pnpm build

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    LOG_LEVEL=info
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=prod-deps /app/games/mtg/node_modules ./games/mtg/node_modules
COPY --from=prod-deps /app/games/pokemon/node_modules ./games/pokemon/node_modules
COPY --from=prod-deps /app/connectors/obs/node_modules ./connectors/obs/node_modules

COPY --from=build /app/package.json ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/games ./games
COPY --from=build /app/connectors ./connectors
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/backend/src ./backend/src
COPY --from=build /app/backend/drizzle ./backend/drizzle
COPY --from=build /app/frontend/dist ./frontend/dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "backend/src/main.ts"]
