#!/bin/sh
# Generate .dev.vars from compose env, then run wrangler on 0.0.0.0:8787.
set -eu

api_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
workspace_root=$(CDPATH= cd -- "$api_dir/../.." && pwd)
workspace_modules="$workspace_root/node_modules"
workspace_lock="$workspace_root/package-lock.json"
install_stamp="$workspace_modules/.videoq-package-lock"

# Named volume for the workspace node_modules may be empty or stale.
needs_npm_ci=0
if [ ! -x "$workspace_modules/.bin/wrangler" ]; then
  needs_npm_ci=1
elif [ ! -d "$workspace_modules/@hono/trpc-server" ] \
  || [ ! -d "$workspace_modules/@videoq/trpc" ]; then
  needs_npm_ci=1
elif [ ! -f "$install_stamp" ] \
  || ! cmp -s "$workspace_lock" "$install_stamp" 2>/dev/null; then
  needs_npm_ci=1
fi
if [ "$needs_npm_ci" -eq 1 ]; then
  echo "Installing API workspace dependencies (npm ci)..."
  (cd "$workspace_root" && npm ci --workspace @videoq/api)
  cp "$workspace_lock" "$install_stamp"
fi

cat > "$api_dir/.dev.vars" <<EOF
AUTH_JWT_SECRET=${AUTH_JWT_SECRET:-dev-only-auth-jwt-secret-change-me}
USER_SECRET_ENCRYPTION_KEY=${USER_SECRET_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://api.openai.com/v1}
LLM_MODEL=${LLM_MODEL:-gpt-4o-mini}
EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-ollama}
EMBEDDING_MODEL=${EMBEDDING_MODEL:-qwen3-embedding:0.6b}
EMBEDDING_VECTOR_SIZE=${EMBEDDING_VECTOR_SIZE:-1024}
DEFAULT_FROM_EMAIL=${DEFAULT_FROM_EMAIL:-noreply@videoq.local}
MAILGUN_API_KEY=${MAILGUN_API_KEY:-}
MAILGUN_SENDER_DOMAIN=${MAILGUN_SENDER_DOMAIN:-mg.videoq.jp}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-minioadmin}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-minioadmin}
R2_S3_ENDPOINT=${R2_S3_ENDPOINT:-http://127.0.0.1:9000}
R2_S3_INTERNAL_ENDPOINT=${R2_S3_INTERNAL_ENDPOINT:-http://minio:9000}
R2_BUCKET_NAME=${R2_BUCKET_NAME:-videoq-media}
R2_S3_REGION=${R2_S3_REGION:-us-east-1}
SQS_QUEUE_URL=${SQS_QUEUE_URL:-http://elasticmq:9324/000000000000/videoq-jobs}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-local}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-local}
OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
EOF

export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="${CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:-postgresql://postgres:postgres@postgres:5432/postgres}"

cd "$api_dir"
exec npx wrangler dev --ip 0.0.0.0 --port 8787 --local-protocol http
