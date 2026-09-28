#!/bin/sh
# Stamp existing schema (if any), then apply pending Drizzle migrations.
set -eu
cd "$(dirname "$0")/.."
node scripts/stamp-baseline.mjs
# Keep complete migration output visible in deployment logs.
set +e
migrate_output=$(node --import tsx scripts/migrate-database.ts 2>&1)
migrate_status=$?
set -e
printf '%s\n' "$migrate_output" | sed 's/\x1B\[[0-9;]*[A-Za-z]//g'
if [ "$migrate_status" -ne 0 ]; then
  exit "$migrate_status"
fi
node scripts/purge-retired-study-data.mjs
