#!/usr/bin/env bash
# Applies this design update to the installed site on this server. Pages, design and the
# application are replaced; the client's catalog, enquiries, orders, contact details and
# accounts are kept.
#   sudo ./update.sh [installed-folder]     (found automatically when omitted)
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
upd() { grep -E "^$1=" update.env | head -1 | cut -d= -f2-; }

command -v docker >/dev/null || fail "Docker is not installed."
docker info >/dev/null 2>&1 || fail "Cannot reach Docker. Run with sudo, or start the Docker service."
SLUG=$(upd CELL_SLUG)
PROJECT="site-${SLUG}"

TARGET=${1:-}
if [ -z "$TARGET" ]; then
  CFG=$(docker compose ls -a --format json | tr '{' '\n' | grep "\"Name\":\"$PROJECT\"" | grep -o '"ConfigFiles":"[^"]*"' | cut -d'"' -f4 | cut -d, -f1 || true)
  [ -n "$CFG" ] && TARGET=$(dirname "$CFG")
fi
[ -n "$TARGET" ] && [ -f "$TARGET/docker-compose.yml" ] && [ -f "$TARGET/.env" ] || fail "The installed site was not found. Pass its folder: ./update.sh /path/to/installed/site"
get() { grep -E "^$1=" "$TARGET/.env" | head -1 | cut -d= -f2-; }
C="docker compose -p $PROJECT --project-directory $TARGET -f $TARGET/docker-compose.yml"
say "Updating ${SLUG} in ${TARGET}"

say "Loading the new application image"
docker load -i images/api.tar.gz
sed -i "s#^API_IMAGE=.*#API_IMAGE=$(upd API_IMAGE)#" "$TARGET/.env"

say "Replacing the website files"
rm -rf "$TARGET/site" && cp -r site "$TARGET/site"

say "Restarting with the new version"
$C up -d
printf 'Waiting for the site to start'
for _ in $(seq 1 90); do $C logs api 2>/dev/null | grep -q "API listening" && break; printf '.'; sleep 2; done
echo
$C logs api 2>/dev/null | grep -q "API listening" || fail "The site did not start. Logs: $C logs api"

say "Applying the new design"
$C exec -T api sh -c 'tar -xzf - -C /data/uploads' < data/files.tar.gz
DB=$($C exec -T db psql -U sb_admin -d sb_control -tAc "SELECT db_name FROM tenants WHERE slug = '$SLUG'" | tr -d '\r[:space:]')
[ -n "$DB" ] || fail "The site's database was not found."
sed "s#$(upd OLD_SITE_URL)#$(get SITE_URL)#g" data/design.sql | $C exec -T db psql -U sb_admin -d "$DB" -v ON_ERROR_STOP=1 -q >/dev/null
$C up -d --force-recreate proxy >/dev/null 2>&1

cat <<EOF

==================================================
 Update applied

 Site     $(get SITE_URL)
 Admin    $(get SITE_URL)/admin

 Ports on this machine
   $(get HTTP_PORT)/tcp   HTTP  (site, admin, API)
   $(get HTTPS_PORT)/tcp   HTTPS$( [ "$(get DOMAIN)" = ":80" ] && echo " (not used without a domain)")
==================================================
EOF
$C ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
