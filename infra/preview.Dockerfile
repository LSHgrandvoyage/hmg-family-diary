# Synthetic preview only. No family records, authentication or production audio volume.
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app
RUN npm install --global pnpm@11.13.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/diary/package.json packages/diary/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY workers/diary/package.json workers/diary/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
COPY scripts/generate-audio-fixture.ts scripts/generate-audio-fixture.ts
COPY specs/001-family-trip-memory/contracts specs/001-family-trip-memory/contracts
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
