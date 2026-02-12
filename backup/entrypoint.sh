#!/bin/bash
set -e

# Default schedule (every day at 3 AM UTC) if not provided
# Cron format: min hour day month dow
SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"

echo "Setting up backup cron job with schedule: ${SCHEDULE}"

# Create crontab file
# We direct output to stdout/stderr so docker logs show it
echo "${SCHEDULE} /usr/local/bin/backup.sh > /proc/1/fd/1 2>/proc/1/fd/2" > /etc/crontabs/root

# Start cron in foreground
echo "Starting crond..."
exec crond -f -l 2
