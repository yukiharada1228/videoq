#!/bin/sh
# Stamp existing schema (if any), then apply pending Drizzle migrations.
set -eu
cd "$(dirname "$0")/.."
node scripts/stamp-baseline.mjs
exec npx drizzle-kit migrate
