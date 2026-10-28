#!/bin/sh
# First start of an empty database: restore the exported cluster (roles + databases)
# and point stored links at the new address.
set -e
echo "restoring exported database"
sed "s#${OLD_SITE_URL}#${SITE_URL}#g" /restore/db.sql | psql -v ON_ERROR_STOP=0 -q -U "$POSTGRES_USER" -d postgres >/dev/null
echo "database restored"
