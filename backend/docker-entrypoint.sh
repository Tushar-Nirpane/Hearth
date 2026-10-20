#!/bin/sh
set -e

DB="${HEARTH_DB:-/data/hearth.db}"

if [ ! -f "$DB" ]; then
  echo "[boot] no database at $DB — seeding demo data"
  node dist/seed.js || echo "[boot] seed failed; starting with an empty database"
else
  echo "[boot] database found at $DB"
fi

exec "$@"
