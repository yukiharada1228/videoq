#!/bin/sh
# Clear local wrangler RateLimiter Durable Object state (login/signup throttles).
# Restart `wrangler dev` / the API container afterwards so DOs reload empty.
set -eu
cd "$(dirname "$0")/.."

do_root=".wrangler/state/v3/do"
if [ ! -d "$do_root" ]; then
  echo "No local Durable Object state at $do_root — nothing to reset."
  exit 0
fi

removed=0
for dir in "$do_root"/*RateLimiter*; do
  if [ -e "$dir" ]; then
    rm -rf "$dir"
    echo "removed $dir"
    removed=$((removed + 1))
  fi
done

if [ "$removed" -eq 0 ]; then
  echo "No RateLimiter DO directories under $do_root — nothing to reset."
  exit 0
fi

echo "Rate limit counters cleared ($removed). Restart the local API (wrangler dev)."
