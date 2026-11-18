# syntax=docker/dockerfile:1
# Build context: monorepo root
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker-service ./apps/worker-service
RUN pnpm install --frozen-lockfile --filter @forge/worker-service...
RUN pnpm --filter @forge/worker-service... build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/worker-service
CMD ["node", "dist/main.js"]
