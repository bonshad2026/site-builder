#!/bin/sh
# Cell API start-up: migrate, make sure the cell's accounts and site exist, then serve.
set -e
cd /app/apps/api

node dist/cli.js migrate

if [ "$CELL_DEMO" = "true" ]; then
  # Demo content (Atelier Navar); skipped when the site already exists. Development images only.
  DEV_ADMIN_EMAIL="$CELL_OPERATOR_EMAIL" DEV_ADMIN_PASSWORD="$CELL_OPERATOR_PASSWORD" \
  DEV_OWNER_EMAIL="$CELL_OWNER_EMAIL" DEV_OWNER_PASSWORD="$CELL_OWNER_PASSWORD" \
    npx tsx --conditions=source scripts/seed-demo.ts
else
  node dist/cell-bootstrap.js
fi

exec node dist/server.js
