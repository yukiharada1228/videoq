#!/bin/sh
# Compose one-shot: ensure deps, then stamp + migrate.
set -eu
cd "$(dirname "$0")/.."

if [ ! -x node_modules/.bin/drizzle-kit ] || [ ! -f node_modules/.package-lock.json ] \
  || ! cmp -s package-lock.json node_modules/.package-lock.json 2>/dev/null; then
  echo "Installing npm dependencies for migrate (npm ci)..."
  npm ci
  cp package-lock.json node_modules/.package-lock.json
fi

exec npm run db:migrate
