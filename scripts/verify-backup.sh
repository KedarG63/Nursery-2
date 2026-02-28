#!/bin/bash

set -e

# Configuration
S3_BUCKET="${S3_BUCKET:-nursery-backups}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
TEMP_DIR="/tmp/backup-verify-$$"

echo "[$(date)] Starting backup verification..."

# Get latest backup
LATEST_BACKUP=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --region "${AWS_REGION}" | \
  grep "nursery_backup_" | sort | tail -n 1 | awk '{print $4}')

if [ -z "${LATEST_BACKUP}" ]; then
  echo "ERROR: No backups found"
  exit 1
fi

echo "[$(date)] Latest backup: ${LATEST_BACKUP}"

# Create temp directory
mkdir -p "${TEMP_DIR}"

# Download backup
echo "[$(date)] Downloading backup..."
aws s3 cp "s3://${S3_BUCKET}/backups/${LATEST_BACKUP}" \
  "${TEMP_DIR}/${LATEST_BACKUP}" \
  --region "${AWS_REGION}"

# Verify checksum
echo "[$(date)] Verifying checksum..."
aws s3 cp "s3://${S3_BUCKET}/backups/${LATEST_BACKUP}.sha256" \
  "${TEMP_DIR}/${LATEST_BACKUP}.sha256" \
  --region "${AWS_REGION}"

EXPECTED_CHECKSUM=$(cat "${TEMP_DIR}/${LATEST_BACKUP}.sha256")
ACTUAL_CHECKSUM=$(sha256sum "${TEMP_DIR}/${LATEST_BACKUP}" | awk '{print $1}')

if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL_CHECKSUM}" ]; then
  echo "ERROR: Checksum verification failed!"
  rm -rf "${TEMP_DIR}"
  exit 1
fi

echo "[$(date)] Checksum verified ✓"

# Verify file integrity
echo "[$(date)] Verifying file integrity..."
if [[ "${LATEST_BACKUP}" == *.gz ]]; then
  gunzip -t "${TEMP_DIR}/${LATEST_BACKUP}"
  if [ $? -eq 0 ]; then
    echo "[$(date)] Compression integrity verified ✓"
  else
    echo "ERROR: Compression integrity check failed"
    rm -rf "${TEMP_DIR}"
    exit 1
  fi
fi

# Clean up
rm -rf "${TEMP_DIR}"

echo "[$(date)] Backup verification completed successfully! ✓"

# Send metric
aws cloudwatch put-metric-data \
  --namespace "NurseryManagement" \
  --metric-name "BackupVerificationSuccess" \
  --value 1 \
  --dimensions Environment=production \
  --region "${AWS_REGION}" 2>/dev/null || true

exit 0
