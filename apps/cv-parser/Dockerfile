# syntax=docker/dockerfile:1
# ADR-0008: güvenilmeyen PDF'leri API sürecinden ayrı, ağdan yalıtılmış bir konteynerde okur.
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cv-parser/package.json apps/cv-parser/
RUN pnpm install --frozen-lockfile --filter @jobtrack/cv-parser
COPY tsconfig.base.json ./
COPY apps/cv-parser apps/cv-parser
RUN pnpm --filter @jobtrack/cv-parser build

FROM node:24-slim
# poppler-utils: pdftotext/pdftoppm; tesseract: OCR (Türkçe + İngilizce dil verisi).
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-tur tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/cv-parser/dist ./dist
USER node
EXPOSE 8090
CMD ["node", "dist/server.js"]
