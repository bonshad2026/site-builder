#!/usr/bin/env bash
# Installs this site package on Linux (Docker + Docker Compose required). Safe to re-run.
#   sudo ./install.sh [-y]
#   -y: no questions; installs on this machine without a domain, on the first free port from 8090.
set -euo pipefail
cd "$(dirname "$0")"
YES=$([ "${1:-}" = "-y" ] && echo 1 || echo 0)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
set_env() { # set_env KEY VALUE
  if grep -qE "^$1=" .env; then sed -i "s#^$1=.*#$1=$(printf '%s' "$2" | sed 's/[#&\\]/\\&/g')#" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- 3<&- && return 0 || return 1; }
free_port() { local p=$1; while port_busy "$p"; do p=$((p + 1)); done; echo "$p"; }
ask() { local prompt=$1 def=${2:-} v; [ "$YES" = 1 ] && { echo "$def"; return; }; read -rp "$prompt${def:+ [$def]}: " v; echo "${v:-$def}"; }

command -v docker >/dev/null || fail "Docker is not installed: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available (docker compose)."
docker info >/dev/null 2>&1 || fail "Cannot reach Docker. Run with sudo, or start the Docker service."
[ -f .env ] || fail ".env is missing next to this script."

SLUG=$(get CELL_SLUG)
PROJECT="site-${SLUG}"
NAME=$(get CELL_NAME)
say "Installing ${NAME:-$SLUG}"

if docker volume inspect "${PROJECT}_pgdata" >/dev/null 2>&1; then
  say "Already installed: keeping the current settings and data."
else
  echo "Leave the domain empty to run on this machine without a domain (HTTP on a port)."
  DOMAIN=$(ask "Domain (e.g. ${SLUG}.ir)")
  if [ -n "$DOMAIN" ]; then
    port_busy 80 && fail "Port 80 is in use; free it (the domain needs ports 80 and 443)."
    port_busy 443 && fail "Port 443 is in use; free it (the domain needs ports 80 and 443)."
    set_env DOMAIN "$DOMAIN"; set_env SITE_URL "https://$DOMAIN"
    set_env HTTP_PORT 80; set_env HTTPS_PORT 443
    SMTP=$(ask "SMTP URL for e-mail (e.g. smtps://user:pass@mail.example.com:465)")
    if [ -n "$SMTP" ]; then
      set_env NODE_ENV production
      set_env EMAIL_PROVIDER smtp; set_env SMTP_URL "$SMTP"
      set_env EMAIL_FROM "$(ask "Sender address" "${NAME:-$SLUG} <no-reply@$DOMAIN>")"
      KEY=$(ask "Kavenegar API key for SMS codes (empty: no SMS)")
      if [ -n "$KEY" ]; then
        set_env SMS_PROVIDER kavenegar; set_env KAVENEGAR_API_KEY "$KEY"
        set_env KAVENEGAR_OTP_TEMPLATE "$(ask "Kavenegar verify template")"
      else
        fail "Production needs an SMS provider. Re-run and enter a Kavenegar key, or leave SMTP empty for test mode."
      fi
    else
      echo "No SMTP: test mode (e-mails and SMS codes are only written to the logs)."
      set_env NODE_ENV development; set_env EMAIL_PROVIDER console; set_env SMS_PROVIDER console
    fi
  else
    HOST=$(ask "Address the site is opened with" "localhost")
    PORT=$(free_port "$(ask "HTTP port" "$(free_port 8090)")")
    set_env DOMAIN ":80"; set_env SITE_URL "http://$HOST:$PORT"
    set_env HTTP_PORT "$PORT"; set_env HTTPS_PORT "$(free_port 8453)"
    set_env NODE_ENV development; set_env EMAIL_PROVIDER console; set_env SMS_PROVIDER console
  fi
fi

say "Loading the application image"
docker load -i images/api.tar.gz

say "Starting"
docker compose -p "$PROJECT" up -d

printf 'Waiting for the site to start'
for _ in $(seq 1 90); do
  docker compose -p "$PROJECT" logs api 2>/dev/null | grep -q "API listening" && break
  printf '.'; sleep 2
done
echo
docker compose -p "$PROJECT" logs api 2>/dev/null | grep -q "API listening" || fail "The site did not start. Logs: docker compose -p $PROJECT logs api"

SITE_URL=$(get SITE_URL)
cat <<EOF

==================================================
 ${NAME:-$SLUG} is running

 Site     ${SITE_URL}
 Admin    ${SITE_URL}/admin
 Sign in  $(get CELL_OWNER_EMAIL) / $(get CELL_OWNER_PASSWORD)

 Ports on this machine
   $(get HTTP_PORT)/tcp   HTTP  (site, admin, API)
   $(get HTTPS_PORT)/tcp   HTTPS$( [ "$(get DOMAIN)" = ":80" ] && echo " (not used without a domain)")
   Database and API are internal only (no host ports).

 Manage (in this folder)
   docker compose -p $PROJECT ps
   docker compose -p $PROJECT logs -f api
   docker compose -p $PROJECT down        # stop (data is kept)
==================================================
EOF
docker compose -p "$PROJECT" ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
