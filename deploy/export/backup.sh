#!/usr/bin/env bash
# Backs up this site: the whole database and the uploaded files, into backups/<date-time>/.
# Keeps the newest 14 backups (BACKUP_KEEP in .env to change). The installer runs it every night.
#   ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"
get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
PROJECT="site-$(get CELL_SLUG)"
KEEP=$(get BACKUP_KEEP); KEEP=${KEEP:-14}
DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"

# --clean: the dump drops and recreates each database, so restore.sh works on a running server.
docker compose -p "$PROJECT" exec -T db pg_dumpall -U sb_admin --clean --if-exists | gzip > "$DIR/db.sql.gz"
docker compose -p "$PROJECT" exec -T api sh -c 'cd /data/uploads && tar -czf - .' > "$DIR/uploads.tar.gz"
[ -s "$DIR/db.sql.gz" ] || { echo "backup failed: empty database dump" >&2; exit 1; }
echo "backup: $DIR ($(du -sh "$DIR" | cut -f1))"

# Older backups beyond the newest $KEEP go.
ls -1d backups/*/ 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf
