#!/bin/sh
# Generate .dev.vars from compose env, then run wrangler on 0.0.0.0:8787.
set -eu

# Named volume for node_modules may be empty on first boot.
if [ ! -x node_modules/.bin/wrangler ]; then
  echo "Installing npm dependencies..."
  npm ci
fi

cat > /app/.dev.vars <<EOF
JWT_SECRET=${JWT_SECRET:-${SECRET_KEY:-dev-insecure-jwt-secret}}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
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

exec npx wrangler dev --ip 0.0.0.0 --port 8787 --local-protocol http
