# Disaster Recovery Plan

## Overview
This document outlines the disaster recovery procedures for the Nursery Management System.

**Document Version:** 1.0
**Last Updated:** 2024-10-20
**Next Review:** After Phase 20 completion

## Recovery Objectives
- **Recovery Time Objective (RTO):** 4 hours
- **Recovery Point Objective (RPO):** 24 hours

## Backup Strategy

### Automated Backups
- **Frequency:** Daily at 2:00 AM UTC
- **Retention:** 30 days
- **Storage:** AWS S3 with versioning enabled
- **Encryption:** GPG encryption before upload (optional)
- **Verification:** Monthly automated verification

### Backup Contents
- PostgreSQL database (full dump)
- Application logs (last 7 days)
- User uploaded files (S3)
- Configuration files

## Recovery Procedures

### Scenario 1: Database Corruption

**Detection:**
- Application errors related to database queries
- Data integrity issues reported by users
- CloudWatch alarms for database health

**Recovery Steps:**

1. Identify the issue:
   ```bash
   # Check database logs
   tail -f /var/log/postgresql/postgresql.log

   # Run database integrity check
   psql -c "SELECT pg_database.datname FROM pg_database;"
   ```

2. Download latest backup:
   ```bash
   cd /opt/nursery
   ./scripts/restore-db.sh --latest
   ```

3. Verify restore:
   ```bash
   # Check table counts
   psql -d nursery_management -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables;"

   # Verify recent orders exist
   psql -d nursery_management -c "SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '7 days';"
   ```

4. Restart application:
   ```bash
   docker-compose restart backend
   ```

5. Monitor for 30 minutes:
   - Check CloudWatch dashboard
   - Verify user access
   - Test critical functions

**Estimated Recovery Time:** 1-2 hours

### Scenario 2: Complete Infrastructure Failure

**Detection:**
- All services unavailable
- AWS region outage
- Complete data center failure

**Recovery Steps:**

1. Provision new infrastructure in alternate region:
   ```bash
   cd terraform
   terraform init
   terraform apply -var="aws_region=ap-southeast-1"
   ```

2. Restore database from S3:
   ```bash
   ./scripts/restore-db.sh --latest
   ```

3. Deploy application:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. Update DNS to point to new infrastructure

5. Verify all services:
   ```bash
   curl https://api.example.com/health/detailed
   ```

**Estimated Recovery Time:** 3-4 hours

### Scenario 3: Data Loss (Accidental Deletion)

**Detection:**
- User reports missing data
- Audit logs show deletion

**Recovery Steps:**

1. Identify deletion time from logs

2. Find backup closest to deletion time:
   ```bash
   aws s3 ls s3://nursery-backups/backups/ | grep "20240320"
   ```

3. Restore to temporary database:
   ```bash
   DB_NAME=nursery_temp ./scripts/restore-db.sh nursery_backup_20240320_020000.sql.gz.gpg
   ```

4. Extract deleted records:
   ```sql
   -- Export deleted records
   \copy (SELECT * FROM orders WHERE id IN (...)) TO '/tmp/recovered_orders.csv' CSV HEADER;
   ```

5. Import into production database:
   ```sql
   \copy orders FROM '/tmp/recovered_orders.csv' CSV HEADER;
   ```

6. Clean up temporary database

**Estimated Recovery Time:** 30 minutes - 2 hours

## Backup Scripts

### Creating a Backup

```bash
# Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=nursery_management
export DB_USER=postgres
export DB_PASSWORD=your_password
export S3_BUCKET=nursery-backups
export AWS_REGION=ap-south-1

# Run backup script
./scripts/backup-db.sh
```

### Restoring from Backup

```bash
# Restore latest backup
./scripts/restore-db.sh --latest

# Restore specific backup
./scripts/restore-db.sh nursery_backup_20240320_020000.sql.gz
```

### Verifying Backups

```bash
# Run verification script
./scripts/verify-backup.sh
```

### Setting Up Automated Backups

```bash
# Install cron jobs
./scripts/setup-backup-cron.sh
```

## Testing Schedule

### Monthly Tests
- Verify latest backup integrity
- Test restore to staging environment
- Document any issues encountered

### Quarterly Tests
- Full disaster recovery drill
- Alternate region failover test
- Team training on recovery procedures

### Annual Tests
- Complete infrastructure rebuild
- Multi-region failover test
- Update recovery documentation

## Contact Information

### On-Call Rotation
- **Primary:** DevOps Team (+91-XXX-XXX-XXXX)
- **Secondary:** Backend Team (+91-XXX-XXX-XXXX)
- **Escalation:** CTO (+91-XXX-XXX-XXXX)

### External Contacts
- **AWS Support:** Premium Support Plan
- **Database Consultant:** consultant@example.com
- **Security Team:** security@example.com

## Recovery Checklist

After any recovery:
- [ ] Verify all services are running
- [ ] Check data integrity
- [ ] Review logs for errors
- [ ] Update incident documentation
- [ ] Notify stakeholders
- [ ] Schedule post-mortem
- [ ] Update DR procedures if needed

## Infrastructure Details

### Database Configuration
- **Engine:** PostgreSQL 14
- **Instance:** db.t3.micro (production: db.t3.small recommended)
- **Storage:** 20GB (auto-scaling to 100GB)
- **Backup Retention:** 7 days (RDS automatic backups)
- **Multi-AZ:** Enabled in production

### Application Servers
- **Type:** EC2 t3.small
- **Auto Scaling:** 1-4 instances
- **Load Balancer:** Application Load Balancer
- **Deployment:** Docker containers

### Storage
- **User Uploads:** S3 bucket with versioning
- **Backups:** Separate S3 bucket with 30-day lifecycle
- **Logs:** CloudWatch Logs (30-day retention)

## Monitoring and Alerts

### CloudWatch Alarms
- High error rate (> 50 errors in 5 minutes)
- High CPU usage (> 80% for 10 minutes)
- High database connections (> 80 connections)
- Slow API response time (> 2 seconds average)

### Health Checks
- **/health** - Basic health check
- **/health/detailed** - Comprehensive health with dependencies
- **/health/ready** - Readiness probe
- **/health/live** - Liveness probe

## Security Considerations

### Backup Security
- All backups encrypted at rest (S3 encryption)
- Optional GPG encryption for additional security
- Checksums verified on restore
- Access restricted via IAM policies

### Access Control
- Backups accessible only to authorized personnel
- MFA required for production access
- Audit logging enabled for all backup operations

## Common Issues and Solutions

### Issue: Backup Script Fails

**Symptoms:**
- Cron job reports errors
- No new backups in S3

**Solutions:**
1. Check database connectivity
2. Verify AWS credentials
3. Check S3 bucket permissions
4. Review script logs: `/var/log/nursery-backup.log`

### Issue: Restore Takes Too Long

**Symptoms:**
- pg_restore runs for hours
- Application downtime extended

**Solutions:**
1. Use parallel restore: `pg_restore -j 4`
2. Consider point-in-time recovery from RDS
3. Restore to smaller database first, then migrate

### Issue: Backup Verification Fails

**Symptoms:**
- Checksum mismatch
- Corrupted backup file

**Solutions:**
1. Re-download backup from S3
2. Use previous backup
3. Restore from RDS automated backup
4. Check S3 versioning for intact copy

## Maintenance Windows

### Regular Maintenance
- **Frequency:** Monthly (First Sunday, 2-6 AM UTC)
- **Activities:**
  - DR drill
  - Backup verification
  - Infrastructure updates
  - Security patches

### Emergency Maintenance
- Can be triggered 24/7 for critical issues
- Requires approval from on-call engineer
- Stakeholders notified via email/Slack

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-10-20 | Initial version | DevOps Team |

## Related Documentation

- [PHASE_20_IMPLEMENTATION_PLAN.md](../PHASE_20_IMPLEMENTATION_PLAN.md) - Complete Phase 20 implementation details
- [README.md](../README.md) - General project documentation
- [Terraform Configuration](../terraform/) - Infrastructure as Code

## Appendix A: Database Schema Backup

```sql
-- Backup schema only
pg_dump -h localhost -U postgres -d nursery_management --schema-only > schema.sql

-- Backup data only
pg_dump -h localhost -U postgres -d nursery_management --data-only > data.sql
```

## Appendix B: Manual Backup Commands

```bash
# Create manual backup
pg_dump -h localhost -U postgres -d nursery_management \
  -F c -f "manual_backup_$(date +%Y%m%d_%H%M%S).dump"

# Compress and upload
gzip manual_backup_*.dump
aws s3 cp manual_backup_*.dump.gz s3://nursery-backups/manual/
```

## Appendix C: Recovery Time Estimates

| Scenario | Detection | Recovery | Verification | Total RTO |
|----------|-----------|----------|--------------|-----------|
| Database corruption | 15 min | 1 hour | 30 min | 1h 45m |
| Application failure | 5 min | 30 min | 15 min | 50 min |
| Complete outage | 30 min | 2-3 hours | 30 min | 3-4 hours |
| Data loss | Variable | 30-120 min | 30 min | 1-3 hours |

---

**End of Disaster Recovery Plan**
