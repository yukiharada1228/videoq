#!/bin/bash
set -e

# Load settings from environment variables
# Requires: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, AWS_STORAGE_BUCKET_NAME, AWS_S3_ENDPOINT_URL

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="db_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILENAME}"
S3_URI="s3://${AWS_STORAGE_BUCKET_NAME}/backups/postgres/${BACKUP_FILENAME}"

echo "[$(date)] Starting backup: ${BACKUP_FILENAME}"

# Export password for pg_dump
export PGPASSWORD="${POSTGRES_PASSWORD}"

# Dump and compress
echo "Dumping database ${POSTGRES_DB}..."
# Ensure we can connect to the postgres host. We assume the service name is 'postgres'
pg_dump -h postgres -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${BACKUP_PATH}"

# Upload to R2
echo "Uploading to ${S3_URI}..."
# Use endpoint-url from env
aws s3 cp "${BACKUP_PATH}" "${S3_URI}" --endpoint-url "${AWS_S3_ENDPOINT_URL}"

# Cleanup
rm "${BACKUP_PATH}"
echo "[$(date)] Backup completed successfully."
