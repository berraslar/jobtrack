# syntax=docker/dockerfile:1
FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @jobtrack/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @jobtrack/web build

# Caddy ikilisi güncel Go ve x/net ile yeniden derlenir: resmî imajdaki ikili, düzeltmesi Go
# 1.26.9 ve x/net 0.60.0'da olan HTTP/2 ve TLS açıklarını içeriyor (A03, Trivy).
FROM golang:1.26-alpine@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca AS caddy
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.7 \
 && CGO_ENABLED=0 xcaddy build v2.11.7 --output /usr/bin/caddy \
      --replace golang.org/x/net=golang.org/x/net@v0.60.0

# Caddy: statik dosyalar + /api ters vekil + güvenlik başlıkları.
FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
