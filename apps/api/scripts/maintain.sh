#!/bin/sh
# Hono-native DB maintenance window helper.
#
# Usage (from apps/api on your Mac — loads ../.env and rewrites @postgres → 127.0.0.1:55432):
#   npm run db:maintain -- <command> [flags]
# Or set explicitly:
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres npm run db:maintain -- prepare
#
# Commands:
#   prepare     Apply Drizzle migrations (stamp + migrate, creates modern tables)
#   dry-run     Count rows that would be copied (no writes)
#   cutover     Final ETL: copy domain data, invalidate credentials, verify + smoke
#   verify      Count/orphan checks only (no copy)
#   rename      Rename app_* → legacy_* (requires --confirm; --dry-run ok)
#   drop        DROP legacy_* tables (requires --confirm; --dry-run ok)
#   help        Show this help
#
# Typical maintenance window:
#   1. Stop API writes / drain Worker SQS
#   2. npm run db:maintain -- prepare
#   3. npm run db:maintain -- cutover
#   4. Deploy API + Worker (modern table names), resume traffic
#   5. After soak (7–14d): npm run db:maintain -- rename --confirm
#   6. Later:               npm run db:maintain -- drop --confirm
#
set -eu
cd "$(dirname "$0")/.."

NODE="${NODE:-node --experimental-strip-types}"
CMD="${1:-help}"
shift $(( $# > 0 ? 1 : 0 )) || true

# Host default (compose publishes postgres on 55432).
HOST_DATABASE_URL_DEFAULT="${HOST_DATABASE_URL_DEFAULT:-postgresql://postgres:postgres@127.0.0.1:55432/postgres}"

# Load DATABASE_URL from repo .env if unset (apps/api → ../../ no; apps/api → ../.env).
load_database_url_from_dotenv() {
  if [ -n "${DATABASE_URL:-}" ]; then
    return 0
  fi
  for f in .env ../.env; do
    if [ -f "$f" ] && grep -qE '^DATABASE_URL=' "$f"; then
      # shellcheck disable=SC2039
      DATABASE_URL=$(grep -E '^DATABASE_URL=' "$f" | head -1 | cut -d= -f2-)
      DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
      export DATABASE_URL
      echo "note: loaded DATABASE_URL from $f"
      return 0
    fi
  done
}

# Compose .env uses hostname "postgres" (Docker network). On the host that does not
# resolve — rewrite to published port 127.0.0.1:55432. Inside containers, keep as-is.
rewrite_database_url_for_host() {
  if [ -z "${DATABASE_URL:-}" ]; then
    return 0
  fi
  if [ -f /.dockerenv ] && [ "${MAINTAIN_FORCE_HOST_DB:-}" != "1" ]; then
    return 0
  fi
  case "$DATABASE_URL" in
    *@postgres:*|*"@postgres/"*)
      old="$DATABASE_URL"
      DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/@postgres(:[0-9]+)?/@127.0.0.1:55432/')
      export DATABASE_URL
      echo "note: host-side run — rewrote DATABASE_URL host postgres → 127.0.0.1:55432"
      echo "      was: $(printf '%s' "$old" | sed -E 's|://([^:/]+):[^@/]+@|://\1:***@|')"
      echo "      now: $(printf '%s' "$DATABASE_URL" | sed -E 's|://([^:/]+):[^@/]+@|://\1:***@|')"
      ;;
  esac
}

require_database_url() {
  load_database_url_from_dotenv
  if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="$HOST_DATABASE_URL_DEFAULT"
    export DATABASE_URL
    echo "note: DATABASE_URL unset — using host default 127.0.0.1:55432"
  fi
  rewrite_database_url_for_host
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "error: DATABASE_URL is required" >&2
    exit 1
  fi
  export DATABASE_URL
}

has_flag() {
  needle="$1"
  shift
  for a in "$@"; do
    [ "$a" = "$needle" ] && return 0
  done
  return 1
}

smoke_counts() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "(psql not found — skip smoke SQL; ETL verify already ran)"
    return 0
  fi
  echo "==> Smoke counts (modern tables)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'users' AS t, count(*)::bigint AS n FROM users
UNION ALL SELECT 'videos', count(*) FROM videos
UNION ALL SELECT 'video_courses', count(*) FROM video_courses
UNION ALL SELECT 'chat_logs', count(*) FROM chat_logs
UNION ALL SELECT 'scene_embeddings', count(*) FROM scene_embeddings
ORDER BY 1;
SQL
}

cmd_help() {
  awk '
    NR == 1 { next }
    /^set / { exit }
    /^#/ { sub(/^# ?/, ""); print; next }
    /^$/ { print; next }
    { exit }
  ' "$0"
}

cmd_prepare() {
  require_database_url
  echo "==> [prepare] drizzle migrate (stamp + apply pending)"
  npm run db:migrate
  echo "==> prepare done"
}

cmd_dry_run() {
  require_database_url
  echo "==> [dry-run] ETL row counts (no writes)"
  $NODE scripts/etl-copy-legacy.ts --dry-run
}

cmd_verify() {
  require_database_url
  echo "==> [verify] count + orphan checks only"
  $NODE scripts/etl-copy-legacy.ts --verify
  smoke_counts
}

cmd_cutover() {
  require_database_url
  echo "==> [cutover] Final ETL (domain copy + credential invalidation + verify)"
  echo "    Ensure API writes are stopped and Worker SQS is drained."
  $NODE scripts/etl-copy-legacy.ts --truncate --verify
  smoke_counts
  echo ""
  echo "==> cutover ETL complete."
  echo "    All passwords require reset; browser/OAuth/action tokens and SearchAPI keys are invalid."
  echo "    Next: deploy API + Worker built against modern tables, then resume traffic."
  echo "    After soak: npm run db:maintain -- rename --confirm"
  echo "    Later:       npm run db:maintain -- drop --confirm"
}

cmd_rename() {
  require_database_url
  if has_flag --dry-run "$@"; then
    echo "==> [rename] dry-run app_* → legacy_*"
    $NODE scripts/rename-legacy-backup.ts --dry-run
    return 0
  fi
  if ! has_flag --confirm "$@"; then
    echo "error: rename requires --confirm (or --dry-run)" >&2
    exit 1
  fi
  echo "==> [rename] app_* → legacy_*"
  $NODE scripts/rename-legacy-backup.ts --confirm
  echo "==> rename done"
}

cmd_drop() {
  require_database_url
  if has_flag --dry-run "$@"; then
    echo "==> [drop] dry-run DROP legacy_*"
    $NODE scripts/drop-legacy.ts --dry-run
    return 0
  fi
  if ! has_flag --confirm "$@"; then
    echo "error: drop requires --confirm (or --dry-run)" >&2
    exit 1
  fi
  echo "==> [drop] DROP legacy_* CASCADE"
  $NODE scripts/drop-legacy.ts --confirm
  echo "==> drop done"
}

case "$CMD" in
  prepare)  cmd_prepare "$@" ;;
  dry-run)  cmd_dry_run "$@" ;;
  verify)   cmd_verify "$@" ;;
  cutover)  cmd_cutover "$@" ;;
  rename)   cmd_rename "$@" ;;
  drop)     cmd_drop "$@" ;;
  help|-h|--help) cmd_help ;;
  *)
    echo "error: unknown command: $CMD" >&2
    cmd_help
    exit 1
    ;;
esac
