# Yedekleme aracı: veritabanıyla aynı sürüm pg_dump + age (açık anahtarlı, kimlik doğrulamalı şifreleme).
FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
RUN apk add --no-cache age
COPY infra/backup/backup.sh /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
