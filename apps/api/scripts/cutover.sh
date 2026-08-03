#!/bin/sh
# Convenience wrapper — prefer: npm run db:maintain -- cutover
set -eu
cd "$(dirname "$0")/.."
exec sh scripts/maintain.sh cutover "$@"
