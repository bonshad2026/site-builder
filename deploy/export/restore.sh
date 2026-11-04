#!/usr/bin/env bash
# Restores a backup made by backup.sh (database and uploaded files). Everything changed since
# that backup is lost, so it asks first.
#   ./restore.sh backups/20261101-030000
set -euo pipefail
cd "$(dirname "$0")"
DIR=${1:?usage: ./restore.sh backups/<date-time>}
[ -f "$DIR/db.sql.gz" ] || { echo "no backup in $DIR" >&2; exit 1; }
get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
PROJECT="site-$(get CELL_SLUG)"
read -rp "Replace the site's current data with $DIR? Type yes: " ok
[ "$ok" = "yes" ] || { echo "cancelled"; exit 1; }

docker compose -p "$PROJECT" stop api proxy
gunzip -c "$DIR/db.sql.gz" | docker compose -p "$PROJECT" exec -T db psql -q -U sb_admin -d postgres >/dev/null
if [ -f "$DIR/uploads.tar.gz" ]; then
  docker compose -p "$PROJECT" run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /data/uploads/* && tar -xzf - -C /data/uploads' < "$DIR/uploads.tar.gz"
fi
docker compose -p "$PROJECT" up -d
echo "restored from $DIR"
