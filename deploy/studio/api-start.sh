#!/bin/sh
# Studio API start-up: migrate, make sure the operator account exists, then serve.
set -e
cd /app/apps/api

node dist/cli.js migrate
# The operator account always matches deploy/.env (created, or its password reset).
node dist/cli.js set-password --admin --email "$STUDIO_ADMIN_EMAIL" --password "$STUDIO_ADMIN_PASSWORD"

exec node dist/server.js
