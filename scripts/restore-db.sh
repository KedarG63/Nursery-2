#!/bin/bash

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nursery}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nursery_management}"
DB_USER="${DB_USER:-postgres}"
S3_BUCKET="${S3_BUCKET:-nursery-backups}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
GPG_KEY_ID="${GPG_KEY_ID:-}"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file-name> [--latest]"
  echo ""
  echo "Available backups:"
  aws s3 ls "s3://${S3_BUCKET}/backups/" --region "${AWS_REGION}"
  exit 1
fi

BACKUP_FILE="$1"

# Get latest backup if --latest flag is provided
if [ "$BACKUP_FILE" == "--latest" ]; then
  echo "Fetching latest backup..."
  BACKUP_FILE=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --region "${AWS_REGION}" | \
    grep "nursery_backup_" | sort | tail -n 1 | awk '{print $4}')

  if [ -z "${BACKUP_FILE}" ]; then
    echo "ERROR: No backups found in S3"
    exit 1
  fi

  echo "Latest backup: ${BACKUP_FILE}"
fi

# Create restore directory
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting database restore..."

# Download backup from S3
echo "[$(date)] Downloading backup from S3..."
aws s3 cp "s3://${S3_BUCKET}/backups/${BACKUP_FILE}" \
  "${BACKUP_DIR}/${BACKUP_FILE}" \
  --region "${AWS_REGION}"

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to download backup from S3"
  exit 1
fi

# Download and verify checksum
echo "[$(date)] Verifying checksum..."
aws s3 cp "s3://${S3_BUCKET}/backups/${BACKUP_FILE}.sha256" \
  "${BACKUP_DIR}/${BACKUP_FILE}.sha256" \
  --region "${AWS_REGION}"

EXPECTED_CHECKSUM=$(cat "${BACKUP_DIR}/${BACKUP_FILE}.sha256")
ACTUAL_CHECKSUM=$(sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" | awk '{print $1}')

if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL_CHECKSUM}" ]; then
  echo "ERROR: Checksum verification failed!"
  echo "Expected: ${EXPECTED_CHECKSUM}"
  echo "Actual: ${ACTUAL_CHECKSUM}"
  exit 1
fi

echo "[$(date)] Checksum verified successfully"

# Decrypt if file is encrypted
if [[ "${BACKUP_FILE}" == *.gpg ]]; then
  echo "[$(date)] Decrypting backup..."
  gpg --decrypt "${BACKUP_DIR}/${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE%.gpg}"

  if [ $? -ne 0 ]; then
    echo "ERROR: Decryption failed"
    exit 1
  fi

  rm "${BACKUP_DIR}/${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE%.gpg}"
  echo "[$(date)] Decryption completed"
fi

# Decompress if file is gzipped
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  echo "[$(date)] Decompressing backup..."
  gunzip "${BACKUP_DIR}/${BACKUP_FILE}"

  if [ $? -ne 0 ]; then
    echo "ERROR: Decompression failed"
    exit 1
  fi

  BACKUP_FILE="${BACKUP_FILE%.gz}"
  echo "[$(date)] Decompression completed"
fi

# Confirm restore
echo ""
echo "WARNING: This will replace the current database '${DB_NAME}' on ${DB_HOST}"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Drop existing database connections
echo "[$(date)] Terminating existing connections..."
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}';"

# Drop and recreate database
echo "[$(date)] Dropping and recreating database..."
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};"

PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d postgres \
  -c "CREATE DATABASE ${DB_NAME};"

# Restore database
echo "[$(date)] Restoring database..."
PGPASSWORD="${DB_PASSWORD}" pg_restore \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --verbose \
  --no-owner \
  --no-acl \
  "${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -ne 0 ]; then
  echo "ERROR: Database restore failed"
  exit 1
fi

echo "[$(date)] Database restore completed successfully!"

# Clean up
echo "[$(date)] Cleaning up..."
rm -f "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_DIR}/${BACKUP_FILE}.sha256"

# Send CloudWatch metric
aws cloudwatch put-metric-data \
  --namespace "NurseryManagement" \
  --metric-name "RestoreSuccess" \
  --value 1 \
  --dimensions Environment=production \
  --region "${AWS_REGION}" 2>/dev/null || true

# Send notification
if [ -n "${SNS_TOPIC_ARN}" ]; then
  aws sns publish \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Database Restore Completed" \
    --message "Database restore completed at $(date). Source: ${BACKUP_FILE}" \
    --region "${AWS_REGION}" 2>/dev/null || true
fi

echo "[$(date)] Restore process completed!"
