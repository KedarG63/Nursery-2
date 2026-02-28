# Phase 20 Quick Start Guide

This guide helps you quickly get started with the Phase 20 DevOps infrastructure.

---

## 🐳 Docker - Local Development

### Start All Services

```bash
# From project root
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Stop Services

```bash
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

### Rebuild Images

```bash
# Rebuild specific service
docker-compose build backend

# Rebuild all services
docker-compose build

# Rebuild and restart
docker-compose up -d --build
```

### Health Checks

```bash
# Backend health
curl http://localhost:5000/health

# Detailed health
curl http://localhost:5000/health/detailed

# Frontend health
curl http://localhost:3000/health
```

---

## 🏗️ Terraform - Infrastructure

### Initialize Terraform

```bash
cd terraform

# Initialize (first time only)
terraform init

# Upgrade providers
terraform init -upgrade
```

### Configure Variables

```bash
# Copy example
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
# Required: db_username, db_password, ec2_key_name, ssl_certificate_arn, alert_email
```

### Plan Infrastructure

```bash
# Preview changes
terraform plan

# Save plan to file
terraform plan -out=tfplan
```

### Apply Infrastructure

```bash
# Apply with auto-approve
terraform apply -auto-approve

# Apply saved plan
terraform apply tfplan

# Apply specific resource
terraform apply -target=module.vpc
```

### Destroy Infrastructure

```bash
# Destroy everything (BE CAREFUL!)
terraform destroy

# Destroy specific resource
terraform destroy -target=module.ec2
```

### View Outputs

```bash
# Show all outputs
terraform output

# Show specific output
terraform output alb_dns_name
```

---

## 🚀 GitHub Actions - CI/CD

### Trigger Workflows Manually

1. Go to **Actions** tab in GitHub
2. Select workflow (backend-ci, frontend-ci, docker-build, deploy)
3. Click **Run workflow**
4. Select branch and parameters

### View Workflow Results

1. Go to **Actions** tab
2. Click on workflow run
3. View logs for each job

### Required Secrets

Add these in **Settings** → **Secrets and variables** → **Actions**:

```
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
SLACK_WEBHOOK_URL=your_slack_webhook (optional)
```

---

## 📊 Monitoring - Health & Metrics

### Health Endpoints

```bash
# Basic health check
GET /health

# Detailed health check
GET /health/detailed

# Readiness probe (for load balancers)
GET /health/ready

# Liveness probe (for container orchestration)
GET /health/live
```

### CloudWatch Dashboards

1. Go to AWS CloudWatch Console
2. Navigate to **Dashboards**
3. Select `nursery-management-{environment}`

### CloudWatch Alarms

View configured alarms:
1. Go to **CloudWatch** → **Alarms**
2. Filter by `nursery-management`

### Custom Metrics

Metrics are automatically sent from the application:
- `OrdersCreated`
- `DeliveriesCompleted`
- `APIErrors`
- `APIResponseTime`
- `DatabaseQueryTime`
- `CacheHits/CacheMisses`

---

## 💾 Backup & Recovery

### Manual Backup

```bash
# Set environment variables
export DB_HOST=localhost
export DB_NAME=nursery_management
export DB_USER=postgres
export DB_PASSWORD=your_password
export S3_BUCKET=nursery-backups
export AWS_REGION=ap-south-1

# Run backup
./scripts/backup-db.sh
```

### Restore Database

```bash
# Restore latest backup
./scripts/restore-db.sh --latest

# Restore specific backup
./scripts/restore-db.sh nursery_backup_20241020_020000.sql.gz

# List available backups
aws s3 ls s3://nursery-backups/backups/
```

### Verify Backup

```bash
# Verify latest backup
./scripts/verify-backup.sh
```

### Setup Automated Backups

```bash
# Install cron jobs (Linux/Mac)
./scripts/setup-backup-cron.sh

# View installed cron jobs
crontab -l | grep backup
```

---

## 🔧 Common Commands

### Docker

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# View images
docker images

# Remove unused images
docker image prune -a

# View logs
docker logs nursery-backend -f

# Execute command in container
docker exec -it nursery-backend sh

# Restart specific service
docker-compose restart backend
```

### Database

```bash
# Connect to PostgreSQL in Docker
docker exec -it nursery-postgres psql -U postgres -d nursery_management

# Run migration
cd backend
npm run migrate:up

# Rollback migration
npm run migrate:down

# Create migration
npm run migrate:create add_new_column
```

### Application

```bash
# Backend development
cd backend
npm run dev

# Frontend development
cd frontend
npm run dev

# Run tests
npm test

# Build production
npm run build
```

---

## 📋 Environment Variables

### Backend (.env)

```bash
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nursery_management
DB_USER=postgres
DB_PASSWORD=your_password
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis123
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
AWS_REGION=ap-south-1
S3_BUCKET=nursery-uploads
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:5000/api
```

### Docker Compose (.env)

```bash
DB_NAME=nursery_management
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_PASSWORD=redis123
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
```

---

## 🐛 Troubleshooting

### Docker Issues

**Problem:** Containers won't start
```bash
# Check logs
docker-compose logs

# Rebuild images
docker-compose build --no-cache

# Remove volumes and restart
docker-compose down -v
docker-compose up -d
```

**Problem:** Port already in use
```bash
# Find process using port
# Windows
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000

# Kill process or change port in .env
```

### Database Issues

**Problem:** Cannot connect to database
```bash
# Check if database is running
docker ps | grep postgres

# Check database logs
docker logs nursery-postgres

# Test connection
docker exec nursery-postgres pg_isready -U postgres
```

### Terraform Issues

**Problem:** State lock error
```bash
# Force unlock (use carefully)
terraform force-unlock <lock-id>
```

**Problem:** Provider version mismatch
```bash
# Upgrade providers
terraform init -upgrade
```

### Backup Issues

**Problem:** Backup script fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check S3 bucket permissions
aws s3 ls s3://nursery-backups/

# Check PostgreSQL access
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

---

## 📚 Additional Resources

- [PHASE_20_IMPLEMENTATION_PLAN.md](./PHASE_20_IMPLEMENTATION_PLAN.md) - Detailed implementation plan
- [PHASE_20_COMPLETION_REPORT.md](./PHASE_20_COMPLETION_REPORT.md) - Completion report
- [docs/DISASTER_RECOVERY.md](./docs/DISASTER_RECOVERY.md) - Disaster recovery procedures
- [README.md](./README.md) - General project documentation

---

## 🆘 Getting Help

### Check Logs

```bash
# Application logs
tail -f backend/logs/app.log

# Docker logs
docker-compose logs -f

# System logs (Linux)
sudo journalctl -u docker -f
```

### Health Checks

```bash
# Check all services
curl http://localhost:5000/health/detailed

# Check specific service
docker ps
docker logs <container-name>
```

### AWS Resources

```bash
# Check EC2 instances
aws ec2 describe-instances --filters "Name=tag:Project,Values=nursery-management"

# Check RDS instances
aws rds describe-db-instances

# Check S3 buckets
aws s3 ls

# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/ec2/nursery"
```

---

## 🎯 Next Steps

1. ✅ Complete Phase 20 implementation
2. ⬜ Setup SSL certificate
3. ⬜ Configure DNS
4. ⬜ Set production environment variables
5. ⬜ Run security audit
6. ⬜ Perform load testing
7. ⬜ Deploy to staging
8. ⬜ Deploy to production

---

**Quick Start Guide** | Phase 20: Deployment & DevOps
