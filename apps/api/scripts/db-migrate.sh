#!/bin/sh
# Stamp existing schema (if any), then apply pending Drizzle migrations.
set -eu
cd "$(dirname "$0")/.."
node scripts/stamp-baseline.mjs
# drizzle-kit's spinner uses ANSI erase-line and hides the SQL error in CI logs.
set +e
migrate_output=$(npx drizzle-kit migrate 2>&1)
migrate_status=$?
set -e
printf '%s\n' "$migrate_output" | sed 's/\x1B\[[0-9;]*[A-Za-z]//g'
exit "$migrate_status"
