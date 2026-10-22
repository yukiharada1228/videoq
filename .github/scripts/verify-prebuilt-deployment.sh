#!/usr/bin/env bash
# Exercise the actual upload-only path in CI, without deployment credentials.
set -euo pipefail
component=${1:?component required}
case "$component" in api|web|docs) ;; *) exit 1 ;; esac
stage=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/prebuilt.XXXXXX")
export WRANGLER_LOG_PATH="$stage/wrangler.log"
export WRANGLER_SEND_METRICS=false
npm ci --ignore-scripts --prefix .github/deploy-tools
npm audit signatures --prefix .github/deploy-tools
mkdir -p "$stage/$component"
if [ "$component" != docs ]; then
  flags=()
  if [ "$component" = api ]; then flags+=(--minify); fi
  node node_modules/wrangler/bin/wrangler.js deploy \
    --config "apps/$component/wrangler.jsonc" --env production \
    --dry-run --outdir "$stage/$component/worker" --env-file /dev/null "${flags[@]}"
fi
if [ "$component" = web ]; then cp -R apps/web/dist "$stage/web/assets"; fi
if [ "$component" = docs ]; then cp -R apps/docs/build "$stage/docs/assets"; fi
node .github/scripts/deployment-config.cjs "$component" "$stage" "$stage/deployment.json"
node .github/deploy-tools/node_modules/wrangler/bin/wrangler.js deploy \
  --config "$stage/deployment.json" --no-bundle --no-autoconfig --env-file /dev/null --dry-run
if [ "$component" = api ]; then
  mkdir "$stage/migration"
  cp -R apps/api/scripts "$stage/migration/scripts"
  printf '{"type":"module"}\n' > "$stage/migration/package.json"
  ln -s "$PWD/.github/deploy-tools/node_modules" "$stage/migration/node_modules"
  (
    cd "$stage/migration"
    node --import tsx --input-type=module -e \
      'await import("./scripts/migrate-database.ts"); await import("./scripts/purge-retired-study-data.mjs");'
  )
fi
