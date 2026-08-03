#!/bin/sh
# Compose one-shot: ensure deps, then stamp + migrate.
set -eu
cd "$(dirname "$0")/.."

if [ ! -x node_modules/.bin/drizzle-kit ]; then
  echo "Installing npm dependencies for migrate..."
  npm ci
fi

exec npm run db:migrate
