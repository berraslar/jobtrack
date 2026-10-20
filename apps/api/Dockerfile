# syntax=docker/dockerfile:1
# Derleme: tüm workspace kurulur, API ve shared derlenir, yalnızca üretim bağımlılıkları ayrılır.
FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @jobtrack/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @jobtrack/api... build \
 && pnpm --filter @jobtrack/api deploy --prod --legacy /out

# Çalıştırma: distroless, kabuk yok, root olmayan kullanıcı (A02, A03).
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:c1326ce1aad4b976dce3a3da8b7eb5c8328e635e312309a7a0e5319d1470be0d
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/migrations ./migrations
EXPOSE 3000
# Taban imaj zaten root olmayan kullanıcıyla gelir; açıkça yazılır (A02).
USER nonroot
CMD ["dist/server.js"]
