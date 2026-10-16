#!/bin/sh
# NFR-11 geri yükleme tatbikatı (ayda bir). Yedeği geçici, ağa kapalı bir PostgreSQL'e geri yükler,
# temel tutarlılık kontrollerini yapar ve her şeyi siler. Asıl veritabanına dokunmaz.
#
#   ./scripts/restore-drill.sh backups/jobtrack-....dump.age /guvenli/yer/backup-key.txt
set -eu
cd "$(dirname "$0")/.."
BACKUP="${1:?yedek dosyası}"
KEY="${2:?age özel anahtar dosyası}"
NAME="jobtrack-restore-drill-$$"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --name "$NAME" --network none \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:18-alpine >/dev/null
until docker exec "$NAME" pg_isready -U postgres -d drill >/dev/null 2>&1; do sleep 1; done
# İlk kurulum betiği bitip sunucu yeniden başlarken kısa bir boşluk olur.
sleep 2
until docker exec "$NAME" pg_isready -U postgres -d drill >/dev/null 2>&1; do sleep 1; done

echo "Şifre çözülüp geri yükleniyor: $(basename "$BACKUP")"
docker run --rm -i --network none -v "$(realpath "$KEY"):/key:ro" --entrypoint age jobtrack-backup \
  --decrypt --identity /key < "$BACKUP" \
  | docker exec -i "$NAME" pg_restore --username=postgres --dbname=drill \
      --no-owner --no-privileges --exit-on-error

echo "Tutarlılık kontrolleri:"
docker exec -i "$NAME" psql -U postgres -d drill -v ON_ERROR_STOP=1 -At <<'SQL'
select 'migration: ' || string_agg(name, ', ' order by name) from schema_migrations;
select 'kullanıcı: ' || count(*) from users;
select 'başvuru: ' || count(*) from applications;
select 'aşama geçmişi: ' || count(*) from stage_history;
-- Her başvurunun en az bir aşama kaydı olmalı (FR-06 trigger'ı); yoksa tatbikat başarısız olur.
do $$
declare missing int;
begin
  select count(*) into missing from applications a
  where not exists (select 1 from stage_history h where h.application_id = a.id);
  if missing > 0 then raise exception 'geçmişi eksik % başvuru var', missing; end if;
  if not exists (select 1 from schema_migrations) then raise exception 'migration kaydı yok'; end if;
end $$;
select 'tutarlılık: geçmişi eksik başvuru yok ✓';
SQL
echo "Geri yükleme tatbikatı başarılı."
