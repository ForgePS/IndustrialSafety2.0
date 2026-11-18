# syntax=docker/dockerfile:1
# Build context: monorepo root
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/platform-api ./apps/platform-api
RUN pnpm install --frozen-lockfile --filter @forge/platform-api...
RUN pnpm --filter @forge/platform-api... build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime
# DejaVu fonts required by @resvg/resvg-js for label title/line text (QR images
# render without fonts; text is silently dropped otherwise).
RUN apk add --no-cache wget ffmpeg font-dejavu
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/platform-api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
