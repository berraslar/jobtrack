# Yedekleme aracı: veritabanıyla aynı sürüm pg_dump + age (açık anahtarlı, kimlik doğrulamalı şifreleme).
FROM postgres:18-alpine
RUN apk add --no-cache age
COPY infra/backup/backup.sh /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
