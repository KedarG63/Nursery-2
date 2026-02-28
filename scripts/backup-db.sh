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
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="nursery_backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"
ENCRYPTED_FILE="${COMPRESSED_FILE}.gpg"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting database backup..."

# Dump database
echo "[$(date)] Dumping database ${DB_NAME}..."
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --verbose \
  --file="${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: Database dump failed"
  exit 1
fi

echo "[$(date)] Database dump completed: ${BACKUP_FILE}"

# Compress backup
echo "[$(date)] Compressing backup..."
gzip "${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: Compression failed"
  exit 1
fi

echo "[$(date)] Compression completed: ${COMPRESSED_FILE}"

# Encrypt backup if GPG key is provided
if [ -n "${GPG_KEY_ID}" ]; then
  echo "[$(date)] Encrypting backup..."
  gpg --encrypt --recipient "${GPG_KEY_ID}" "${BACKUP_DIR}/${COMPRESSED_FILE}"

  if [ $? -ne 0 ]; then
    echo "[$(date)] ERROR: Encryption failed"
    exit 1
  fi

  rm "${BACKUP_DIR}/${COMPRESSED_FILE}"
  UPLOAD_FILE="${ENCRYPTED_FILE}"
  echo "[$(date)] Encryption completed: ${ENCRYPTED_FILE}"
else
  UPLOAD_FILE="${COMPRESSED_FILE}"
  echo "[$(date)] Skipping encryption (no GPG key provided)"
fi

# Calculate checksum
CHECKSUM=$(sha256sum "${BACKUP_DIR}/${UPLOAD_FILE}" | awk '{print $1}')
echo "${CHECKSUM}" > "${BACKUP_DIR}/${UPLOAD_FILE}.sha256"

echo "[$(date)] Checksum: ${CHECKSUM}"

# Upload to S3
echo "[$(date)] Uploading to S3..."
aws s3 cp "${BACKUP_DIR}/${UPLOAD_FILE}" \
  "s3://${S3_BUCKET}/backups/${UPLOAD_FILE}" \
  --region "${AWS_REGION}" \
  --storage-class STANDARD_IA \
  --metadata "checksum=${CHECKSUM},timestamp=${TIMESTAMP}"

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: S3 upload failed"
  exit 1
fi

# Upload checksum file
aws s3 cp "${BACKUP_DIR}/${UPLOAD_FILE}.sha256" \
  "s3://${S3_BUCKET}/backups/${UPLOAD_FILE}.sha256" \
  --region "${AWS_REGION}"

echo "[$(date)] Upload completed to s3://${S3_BUCKET}/backups/${UPLOAD_FILE}"

# Clean up local files
echo "[$(date)] Cleaning up local files..."
rm -f "${BACKUP_DIR}/${UPLOAD_FILE}" "${BACKUP_DIR}/${UPLOAD_FILE}.sha256"

# Clean up old backups from S3 (older than RETENTION_DAYS)
echo "[$(date)] Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r line; do
  BACKUP_DATE=$(echo "$line" | awk '{print $4}' | grep -o '[0-9]\{8\}' | head -1)
  BACKUP_NAME=$(echo "$line" | awk '{print $4}')

  if [ -n "${BACKUP_DATE}" ] && [ "${BACKUP_DATE}" -lt "${CUTOFF_DATE}" ]; then
    echo "[$(date)] Deleting old backup: ${BACKUP_NAME}"
    aws s3 rm "s3://${S3_BUCKET}/backups/${BACKUP_NAME}"
  fi
done

# Send CloudWatch metric
aws cloudwatch put-metric-data \
  --namespace "NurseryManagement" \
  --metric-name "BackupSuccess" \
  --value 1 \
  --dimensions Environment=production \
  --region "${AWS_REGION}" 2>/dev/null || true

echo "[$(date)] Backup completed successfully!"

# Send notification (optional)
if [ -n "${SNS_TOPIC_ARN}" ]; then
  aws sns publish \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Backup Completed Successfully" \
    --message "Database backup completed at $(date). File: ${UPLOAD_FILE}" \
    --region "${AWS_REGION}" 2>/dev/null || true
fi

exit 0
