#!/bin/sh
# Starts the API inside docker-compose.
set -e

# .env points at Postgres as seen from the host (localhost:5433);
# inside the compose network the database is postgres:5432.
export CONTROL_DATABASE_URL="$(echo "$CONTROL_DATABASE_URL" | sed 's#@localhost:5433/#@postgres:5432/#')"
export PG_ADMIN_URL="$(echo "$PG_ADMIN_URL" | sed 's#@localhost:5433/#@postgres:5432/#')"

node dist/cli.js migrate

# Demo content on a fresh database only (the seed skips an existing demo site).
if [ "${SEED_DEMO:-true}" = "true" ]; then
  npx tsx --conditions=source scripts/seed-demo.ts || echo "[start] demo seed failed; continuing without it"
fi

exec node dist/server.js
