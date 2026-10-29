#!/usr/bin/env bash
# Restores a studio backup made with studio-backup.sh: sites, data, files, packaging records,
# template photos and studio settings, then starts the studio.
#   deploy/backup/studio-restore.sh <studio-backup-….tar.gz> [--replace]
# --replace: delete this machine's existing studio data first (otherwise it refuses).
set -euo pipefail
backup=${1:?Usage: studio-restore.sh <studio-backup-….tar.gz> [--replace]}
replace=${2:-}
backup=$(cd "$(dirname "$backup")" && pwd)/$(basename "$backup")
cd "$(dirname "$0")/../.."
compose="docker compose -f deploy/docker-compose.yml"

docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 1; }
if docker volume inspect site-builder_studio-pgdata >/dev/null 2>&1; then
  [ "$replace" = "--replace" ] || { echo "This machine already has studio data. Run again with --replace to delete it and restore the backup." >&2; exit 1; }
  echo "removing the existing studio data…"
  $compose down -v
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
tar -xzf "$backup" -C "$work"
src=$(ls -d "$work"/studio-backup-*)

echo "settings…"
[ -f deploy/.env ] && cp deploy/.env deploy/.env.before-restore
# Same secrets as the original studio (they unlock the site databases); exports go to this machine's folder.
sed 's#^EXPORT_DIR=.*#EXPORT_DIR=../exports#' "$src/studio.env" > deploy/.env
mkdir -p var exports
tar -xzf "$src/demo-images.tar.gz" -C var

echo "databases…"
$compose up -d studio-db
for _ in $(seq 1 60); do docker exec sb-studio-db pg_isready -h 127.0.0.1 -U sb_admin >/dev/null 2>&1 && break; sleep 2; done
docker exec -i sb-studio-db psql -U sb_admin -d postgres -v ON_ERROR_STOP=0 -q < "$src/studio-db.sql" >/dev/null 2>&1

echo "building and starting the studio (the first build takes a few minutes)…"
$compose up -d --build
echo "files…"
MSYS_NO_PATHCONV=1 docker exec -i sb-studio-api tar -xzf - -C /data/uploads < "$src/uploads.tar.gz"
MSYS_NO_PATHCONV=1 docker exec -i sb-control tar -xzf - -C /data < "$src/control-data.tar.gz"
docker restart sb-control >/dev/null

echo
echo "Restored. Studio: http://admin.localhost  (sign in with the same account as on the original machine)"
docker exec sb-studio-db psql -U sb_admin -d sb_control -tAc "SELECT ' - ' || slug || '  http://' || slug || '.preview.localhost' FROM tenants WHERE status = 'active' ORDER BY created_at"
