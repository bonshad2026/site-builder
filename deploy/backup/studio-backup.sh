#!/usr/bin/env bash
# Backs up the whole studio — every site, its data and files, packaging records, template
# photos and the studio settings (deploy/.env) — into backups/studio-backup-<time>.tar.gz.
# Restore it on another machine with studio-restore.sh (or .ps1). The file contains client
# data and secrets: share it privately.
#   deploy/backup/studio-backup.sh        (the studio must be running)
set -euo pipefail
cd "$(dirname "$0")/../.."
for c in sb-studio-db sb-studio-api sb-control; do
  docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true || { echo "Start the studio first ($c is not running)." >&2; exit 1; }
done

name="studio-backup-$(date +%Y%m%d-%H%M)"
mkdir -p backups/.tmp
work="backups/.tmp/$name"
rm -rf "$work" && mkdir -p "$work"
trap 'rm -rf "backups/.tmp"' EXIT

echo "databases…"
docker exec sb-studio-db pg_dumpall -U sb_admin > "$work/studio-db.sql"
echo "uploaded files…"
MSYS_NO_PATHCONV=1 docker exec sb-studio-api tar -czf - -C /data/uploads . > "$work/uploads.tar.gz"
echo "packaging records…"
MSYS_NO_PATHCONV=1 docker exec sb-control tar -czf - -C /data . > "$work/control-data.tar.gz"
echo "template photos…"
tar -czf "$work/demo-images.tar.gz" -C var demo-images 2>/dev/null || tar -czf "$work/demo-images.tar.gz" -T /dev/null
cp deploy/.env "$work/studio.env"
cat > "$work/README.txt" <<'EOF'
Site Builder studio backup. Restore on a machine with the repository cloned:
  Linux / macOS:  deploy/backup/studio-restore.sh <this-file>.tar.gz
  Windows:        powershell -ExecutionPolicy Bypass -File deploy\backup\studio-restore.ps1 <this-file>.tar.gz
Contains client data and secrets (studio.env). Keep it private.
EOF

tar -czf "backups/$name.tar.gz" -C backups/.tmp "$name"
echo
echo "Backup: $(pwd)/backups/$name.tar.gz ($(du -h "backups/$name.tar.gz" | cut -f1))"
