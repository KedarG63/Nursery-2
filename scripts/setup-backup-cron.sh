#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Setup daily backup at 2 AM
CRON_JOB="0 2 * * * ${SCRIPT_DIR}/backup-db.sh >> /var/log/nursery-backup.log 2>&1"

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v backup-db.sh; echo "$CRON_JOB") | crontab -

echo "Backup cron job installed successfully"
echo "Backups will run daily at 2 AM"

# Setup monthly backup verification
VERIFY_JOB="0 3 1 * * ${SCRIPT_DIR}/verify-backup.sh >> /var/log/nursery-backup-verify.log 2>&1"

(crontab -l 2>/dev/null | grep -v verify-backup.sh; echo "$VERIFY_JOB") | crontab -

echo "Backup verification cron job installed successfully"
echo "Verification will run monthly on the 1st at 3 AM"

# Display installed cron jobs
echo ""
echo "Installed cron jobs:"
crontab -l | grep -E "(backup-db|verify-backup)"
