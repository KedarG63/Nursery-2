# Phase 20 Implementation Plan: Deployment & DevOps

## Overview
Phase 20 focuses on implementing production-ready deployment infrastructure including containerization, cloud infrastructure, CI/CD pipelines, monitoring, and disaster recovery procedures. This phase ensures the application can be reliably deployed, monitored, and maintained in production.

**Issues Covered:** #96 - #100
**Estimated Timeline:** 12-15 days
**Priority:** High (Production Readiness)

---

## Table of Contents
1. [Issue #96: Docker Containerization](#issue-96-docker-containerization)
2. [Issue #97: AWS Infrastructure with Terraform](#issue-97-aws-infrastructure-with-terraform)
3. [Issue #98: CI/CD Pipeline with GitHub Actions](#issue-98-cicd-pipeline-with-github-actions)
4. [Issue #99: Monitoring and Health Checks](#issue-99-monitoring-and-health-checks)
5. [Issue #100: Backup and Disaster Recovery](#issue-100-backup-and-disaster-recovery)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Sequence](#deployment-sequence)
8. [Risk Assessment](#risk-assessment)

---

## Issue #96: Docker Containerization
**Priority:** Critical (Foundation for deployment)
**Estimated Time:** 2-3 days
**Dependencies:** None

### Objectives
Create production-ready Docker containers for backend and frontend with optimized multi-stage builds, proper security configurations, and local development support.

### Implementation Steps

#### Step 1: Backend Dockerfile
**File:** `backend/Dockerfile`

```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Production stage
FROM node:18-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Create logs and uploads directories
RUN mkdir -p logs uploads && \
    chown -R nodejs:nodejs logs uploads

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 5000

CMD ["node", "server.js"]
```

**Key Features:**
- Multi-stage build reduces final image size by ~60%
- Node 18 Alpine base (minimal size, security updates)
- Non-root user for security
- Health check for container orchestration
- Proper file permissions for logs and uploads

#### Step 2: Frontend Dockerfile
**File:** `frontend/Dockerfile`

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Production stage with Nginx
FROM nginx:1.25-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create nginx cache directories
RUN mkdir -p /var/cache/nginx/client_temp && \
    chown -R nginx:nginx /var/cache/nginx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Key Features:**
- Vite build optimization
- Nginx for efficient static file serving
- Custom nginx configuration for SPA routing
- Gzip compression enabled
- Health check endpoint

#### Step 3: Nginx Configuration
**File:** `frontend/nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/javascript application/json;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # API proxy (for development)
        location /api/ {
            proxy_pass http://backend:5000/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # SPA routing - return index.html for all routes
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

#### Step 4: Docker Compose for Local Development
**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    container_name: nursery-postgres
    environment:
      POSTGRES_DB: ${DB_NAME:-nursery_management}
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nursery-network

  redis:
    image: redis:7-alpine
    container_name: nursery-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis123}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - nursery-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: nursery-backend
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      PORT: 5000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME:-nursery_management}
      DB_USER: ${DB_USER:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-redis123}
      JWT_SECRET: ${JWT_SECRET:-your-jwt-secret-here}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:-your-refresh-secret-here}
    ports:
      - "5000:5000"
    volumes:
      - ./backend:/app
      - /app/node_modules
      - backend_logs:/app/logs
      - backend_uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: npm run dev
    networks:
      - nursery-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: builder
    container_name: nursery-frontend
    environment:
      VITE_API_URL: http://localhost:5000/api
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend
    command: npm run dev -- --host 0.0.0.0
    networks:
      - nursery-network

networks:
  nursery-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  backend_logs:
  backend_uploads:
```

#### Step 5: Docker Ignore Files
**File:** `backend/.dockerignore`

```
node_modules
npm-debug.log
.env
.env.local
.env.*.local
*.log
logs
.git
.gitignore
.DS_Store
test
tests
*.test.js
*.spec.js
coverage
.vscode
.idea
README*.md
docs
```

**File:** `frontend/.dockerignore`

```
node_modules
npm-debug.log
.env
.env.local
.env.*.local
dist
build
*.log
.git
.gitignore
.DS_Store
test
tests
*.test.js
*.spec.js
coverage
.vscode
.idea
README*.md
```

**File:** `.dockerignore` (root)

```
.git
.github
node_modules
*/node_modules
.env
.env.local
*.log
*/logs
coverage
.vscode
.idea
*.md
!README.md
.husky
.prettierrc
eslint.config.js
```

#### Step 6: Docker Compose for Production
**File:** `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: nursery-backend:${VERSION:-latest}
    container_name: nursery-backend-prod
    environment:
      NODE_ENV: production
      PORT: 5000
      DB_HOST: ${DB_HOST}
      DB_PORT: ${DB_PORT}
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: ${REDIS_HOST}
      REDIS_PORT: ${REDIS_PORT}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      AWS_REGION: ${AWS_REGION}
      S3_BUCKET: ${S3_BUCKET}
    ports:
      - "5000:5000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - nursery-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: nursery-frontend:${VERSION:-latest}
    container_name: nursery-frontend-prod
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - nursery-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  nursery-network:
    driver: bridge
```

### Testing Checklist
- [ ] Backend Docker image builds successfully
- [ ] Frontend Docker image builds successfully
- [ ] Docker Compose starts all services
- [ ] Database migrations run in container
- [ ] Health checks pass for all services
- [ ] Volume mounts work for logs and uploads
- [ ] Hot reload works in development mode
- [ ] Production build is optimized (image size <200MB for backend)
- [ ] Non-root user runs containers
- [ ] Environment variables inject correctly

---

## Issue #97: AWS Infrastructure with Terraform
**Priority:** High
**Estimated Time:** 3-4 days
**Dependencies:** #96 (Docker setup)

### Objectives
Provision AWS infrastructure using Infrastructure as Code (Terraform) for VPC, RDS, EC2, S3, ElastiCache, and Application Load Balancer.

### Implementation Steps

#### Step 1: Terraform Project Structure

```
terraform/
├── main.tf                 # Main configuration
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.tfvars        # Variable values (gitignored)
├── providers.tf            # Provider configuration
├── backend.tf              # Remote state configuration
└── modules/
    ├── vpc/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── rds/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── ec2/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── s3/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── redis/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── alb/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── security/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

#### Step 2: Main Terraform Configuration
**File:** `terraform/main.tf`

```hcl
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Main configuration
locals {
  project_name = "nursery-management"
  environment  = var.environment
  common_tags = {
    Project     = local.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name        = local.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs

  tags = local.common_tags
}

# Security Groups Module
module "security" {
  source = "./modules/security"

  project_name = local.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id

  tags = local.common_tags
}

# RDS PostgreSQL Module
module "rds" {
  source = "./modules/rds"

  project_name           = local.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  db_subnet_ids          = module.vpc.private_subnet_ids
  db_security_group_ids  = [module.security.rds_security_group_id]
  db_instance_class      = var.db_instance_class
  db_name                = var.db_name
  db_username            = var.db_username
  db_password            = var.db_password
  backup_retention_period = var.backup_retention_period

  tags = local.common_tags
}

# ElastiCache Redis Module
module "redis" {
  source = "./modules/redis"

  project_name          = local.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_ids    = [module.security.redis_security_group_id]
  node_type             = var.redis_node_type
  num_cache_nodes       = var.redis_num_nodes

  tags = local.common_tags
}

# S3 Bucket Module
module "s3" {
  source = "./modules/s3"

  project_name = local.project_name
  environment  = var.environment

  tags = local.common_tags
}

# Application Load Balancer Module
module "alb" {
  source = "./modules/alb"

  project_name       = local.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  security_group_ids = [module.security.alb_security_group_id]
  certificate_arn    = var.ssl_certificate_arn

  tags = local.common_tags
}

# EC2 Instances Module
module "ec2" {
  source = "./modules/ec2"

  project_name          = local.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_ids    = [module.security.ec2_security_group_id]
  instance_type         = var.ec2_instance_type
  key_name              = var.ec2_key_name
  min_size              = var.asg_min_size
  max_size              = var.asg_max_size
  desired_capacity      = var.asg_desired_capacity
  target_group_arn      = module.alb.target_group_arn

  # User data for EC2 initialization
  user_data = templatefile("${path.module}/scripts/user-data.sh", {
    db_host           = module.rds.db_endpoint
    db_name           = var.db_name
    db_username       = var.db_username
    redis_endpoint    = module.redis.redis_endpoint
    s3_bucket         = module.s3.bucket_name
    aws_region        = var.aws_region
  })

  tags = local.common_tags
}
```

#### Step 3: VPC Module
**File:** `terraform/modules/vpc/main.tf`

```hcl
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-vpc"
    }
  )
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-igw"
    }
  )
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-public-subnet-${count.index + 1}"
      Type = "public"
    }
  )
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-private-subnet-${count.index + 1}"
      Type = "private"
    }
  )
}

# NAT Gateway EIPs
resource "aws_eip" "nat" {
  count  = length(var.public_subnet_cidrs)
  domain = "vpc"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-nat-eip-${count.index + 1}"
    }
  )
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = length(var.public_subnet_cidrs)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-nat-${count.index + 1}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-public-rt"
    }
  )
}

# Private Route Tables
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_cidrs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-private-rt-${count.index + 1}"
    }
  )
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = length(var.public_subnet_cidrs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnet_cidrs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}
```

**File:** `terraform/modules/vpc/outputs.tf`

```hcl
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = aws_nat_gateway.main[*].id
}
```

#### Step 4: RDS Module
**File:** `terraform/modules/rds/main.tf`

```hcl
# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.db_subnet_ids

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-db-subnet-group"
    }
  )
}

# DB Parameter Group
resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-pg14"
  family = "postgres14"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = var.tags
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}-db"
  engine         = "postgres"
  engine_version = "14.10"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.db_security_group_ids
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  skip_final_snapshot       = var.environment == "staging"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  auto_minor_version_upgrade = true
  multi_az                   = var.environment == "production"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-db"
    }
  )
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
```

#### Step 5: Variables and Outputs
**File:** `terraform/variables.tf`

```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name (staging/production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "nursery_management"
}

variable "db_username" {
  description = "Database username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "backup_retention_period" {
  description = "Database backup retention period in days"
  type        = number
  default     = 7
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "ec2_key_name" {
  description = "EC2 key pair name"
  type        = string
}

variable "asg_min_size" {
  description = "Minimum size of Auto Scaling Group"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Maximum size of Auto Scaling Group"
  type        = number
  default     = 4
}

variable "asg_desired_capacity" {
  description = "Desired capacity of Auto Scaling Group"
  type        = number
  default     = 2
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for ALB"
  type        = string
}
```

**File:** `terraform/outputs.tf`

```hcl
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.redis.redis_endpoint
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = module.s3.bucket_name
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "ec2_asg_name" {
  description = "Auto Scaling Group name"
  value       = module.ec2.asg_name
}
```

### Testing Checklist
- [ ] Terraform initialization succeeds
- [ ] Terraform plan shows expected resources
- [ ] VPC and subnets created correctly
- [ ] RDS instance accessible from private subnet
- [ ] Redis cluster accessible from private subnet
- [ ] S3 bucket created with encryption
- [ ] ALB configured with SSL certificate
- [ ] EC2 instances launch in Auto Scaling Group
- [ ] Security groups allow correct traffic
- [ ] Tags applied to all resources

---

## Issue #98: CI/CD Pipeline with GitHub Actions
**Priority:** High
**Estimated Time:** 2-3 days
**Dependencies:** #96 (Docker), #97 (Infrastructure)

### Objectives
Implement automated CI/CD pipeline using GitHub Actions for testing, building Docker images, and deploying to staging/production environments.

### Implementation Steps

#### Step 1: Backend CI Workflow
**File:** `.github/workflows/backend-ci.yml`

```yaml
name: Backend CI

on:
  pull_request:
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'
  push:
    branches:
      - main
      - develop
    paths:
      - 'backend/**'

env:
  NODE_VERSION: '18'

jobs:
  lint-and-test:
    name: Lint and Test Backend
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14-alpine
        env:
          POSTGRES_DB: nursery_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Run ESLint
        working-directory: backend
        run: npm run lint || true

      - name: Run database migrations
        working-directory: backend
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: nursery_test
          DB_USER: postgres
          DB_PASSWORD: postgres
        run: npm run migrate:up

      - name: Run tests
        working-directory: backend
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: nursery_test
          DB_USER: postgres
          DB_PASSWORD: postgres
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          JWT_SECRET: test-secret
          JWT_REFRESH_SECRET: test-refresh-secret
        run: npm test

      - name: Generate coverage report
        working-directory: backend
        env:
          NODE_ENV: test
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: nursery_test
          DB_USER: postgres
          DB_PASSWORD: postgres
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          JWT_SECRET: test-secret
          JWT_REFRESH_SECRET: test-refresh-secret
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
          flags: backend
          name: backend-coverage

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run npm audit
        working-directory: backend
        run: npm audit --audit-level=moderate || true

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: './backend'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
```

#### Step 2: Frontend CI Workflow
**File:** `.github/workflows/frontend-ci.yml`

```yaml
name: Frontend CI

on:
  pull_request:
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'
  push:
    branches:
      - main
      - develop
    paths:
      - 'frontend/**'

env:
  NODE_VERSION: '18'

jobs:
  lint-and-test:
    name: Lint and Test Frontend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Run ESLint
        working-directory: frontend
        run: npm run lint || true

      - name: Run tests
        working-directory: frontend
        run: npm test

      - name: Generate coverage report
        working-directory: frontend
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./frontend/coverage/lcov.info
          flags: frontend
          name: frontend-coverage

  build:
    name: Build Frontend
    runs-on: ubuntu-latest
    needs: lint-and-test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Build application
        working-directory: frontend
        env:
          VITE_API_URL: /api
        run: npm run build

      - name: Check build size
        working-directory: frontend
        run: |
          BUILD_SIZE=$(du -sh dist | cut -f1)
          echo "Build size: $BUILD_SIZE"

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: frontend-build
          path: frontend/dist
          retention-days: 7
```

#### Step 3: Docker Build and Push Workflow
**File:** `.github/workflows/docker-build.yml`

```yaml
name: Docker Build and Push

on:
  push:
    branches:
      - main
      - develop
  workflow_dispatch:

env:
  AWS_REGION: ap-south-1
  ECR_REPOSITORY_BACKEND: nursery-backend
  ECR_REPOSITORY_FRONTEND: nursery-frontend

jobs:
  build-backend:
    name: Build and Push Backend Image
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_BACKEND }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_BACKEND }}:latest
          format: 'table'
          exit-code: '0'
          severity: 'CRITICAL,HIGH'

  build-frontend:
    name: Build and Push Frontend Image
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_FRONTEND }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_FRONTEND }}:latest
          format: 'table'
          exit-code: '0'
          severity: 'CRITICAL,HIGH'
```

#### Step 4: Deployment Workflow
**File:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to AWS

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        type: choice
        options:
          - staging
          - production
      version:
        description: 'Docker image tag to deploy'
        required: false
        default: 'latest'

env:
  AWS_REGION: ap-south-1

jobs:
  deploy:
    name: Deploy to ${{ github.event.inputs.environment }}
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.inputs.environment }}
      url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Get EC2 instance IDs
        id: get-instances
        run: |
          INSTANCE_IDS=$(aws ec2 describe-instances \
            --filters "Name=tag:Environment,Values=${{ github.event.inputs.environment }}" \
                      "Name=tag:Project,Values=nursery-management" \
                      "Name=instance-state-name,Values=running" \
            --query 'Reservations[*].Instances[*].InstanceId' \
            --output text)
          echo "instance_ids=$INSTANCE_IDS" >> $GITHUB_OUTPUT

      - name: Deploy to EC2 instances
        id: deploy
        env:
          ENVIRONMENT: ${{ github.event.inputs.environment }}
          VERSION: ${{ github.event.inputs.version }}
          REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        run: |
          for INSTANCE_ID in ${{ steps.get-instances.outputs.instance_ids }}; do
            echo "Deploying to instance: $INSTANCE_ID"

            # Send commands via SSM
            aws ssm send-command \
              --instance-ids "$INSTANCE_ID" \
              --document-name "AWS-RunShellScript" \
              --parameters 'commands=[
                "cd /home/ec2-user/nursery-app",
                "aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin ${{ env.REGISTRY }}",
                "docker-compose pull",
                "docker-compose up -d",
                "docker system prune -af"
              ]' \
              --timeout-seconds 600
          done

          # Get ALB DNS name
          ALB_DNS=$(aws elbv2 describe-load-balancers \
            --names "nursery-$ENVIRONMENT-alb" \
            --query 'LoadBalancers[0].DNSName' \
            --output text)

          echo "url=https://$ALB_DNS" >> $GITHUB_OUTPUT

      - name: Wait for deployment
        run: sleep 60

      - name: Health check
        run: |
          URL="${{ steps.deploy.outputs.url }}/health"
          for i in {1..10}; do
            if curl -f -s "$URL" > /dev/null; then
              echo "Health check passed"
              exit 0
            fi
            echo "Health check attempt $i failed, retrying..."
            sleep 10
          done
          echo "Health check failed after 10 attempts"
          exit 1

      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Deployment to ${{ github.event.inputs.environment }} succeeded",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Successful* ✅\n*Environment:* ${{ github.event.inputs.environment }}\n*Version:* ${{ github.event.inputs.version }}\n*URL:* ${{ steps.deploy.outputs.url }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "❌ Deployment to ${{ github.event.inputs.environment }} failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Failed* ❌\n*Environment:* ${{ github.event.inputs.environment }}\n*Version:* ${{ github.event.inputs.version }}\n*Run:* ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Rollback on failure
        if: failure() && github.event.inputs.environment == 'production'
        run: |
          echo "Rolling back to previous version..."
          for INSTANCE_ID in ${{ steps.get-instances.outputs.instance_ids }}; do
            aws ssm send-command \
              --instance-ids "$INSTANCE_ID" \
              --document-name "AWS-RunShellScript" \
              --parameters 'commands=[
                "cd /home/ec2-user/nursery-app",
                "docker-compose down",
                "git checkout HEAD~1",
                "docker-compose up -d"
              ]'
          done
```

### GitHub Secrets Required
Add these secrets to GitHub repository settings:
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications
- Environment-specific secrets for staging/production

### Testing Checklist
- [ ] Backend CI runs on PR
- [ ] Frontend CI runs on PR
- [ ] Tests pass in CI environment
- [ ] Docker images build successfully
- [ ] Images pushed to ECR
- [ ] Security scanning completes
- [ ] Deployment to staging works
- [ ] Manual approval for production
- [ ] Health checks pass after deployment
- [ ] Slack notifications sent
- [ ] Rollback mechanism works

---

## Issue #99: Monitoring and Health Checks
**Priority:** High
**Estimated Time:** 2-3 days
**Dependencies:** #96 (Docker), #97 (Infrastructure)

### Objectives
Implement comprehensive monitoring with CloudWatch, application logging, health check endpoints, and alerting for production environments.

### Implementation Steps

#### Step 1: Health Check Endpoint
**File:** `backend/routes/health.js`

```javascript
const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const redis = require('../config/redis');
const logger = require('../config/logger');

/**
 * Basic health check endpoint
 * Returns 200 if service is up
 */
router.get('/', async (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'nursery-management-api'
  });
});

/**
 * Detailed health check with dependency checks
 * Checks database, Redis, and other critical services
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'nursery-management-api',
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime(),
    checks: {}
  };

  let isHealthy = true;

  // Check database connection
  try {
    const result = await db.query('SELECT NOW() as now');
    health.checks.database = {
      status: 'healthy',
      responseTime: result.duration || 0,
      timestamp: result.rows[0].now
    };
  } catch (error) {
    isHealthy = false;
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
    logger.error('Database health check failed', { error: error.message });
  }

  // Check Redis connection
  try {
    const start = Date.now();
    await redis.ping();
    const duration = Date.now() - start;
    health.checks.redis = {
      status: 'healthy',
      responseTime: duration
    };
  } catch (error) {
    isHealthy = false;
    health.checks.redis = {
      status: 'unhealthy',
      error: error.message
    };
    logger.error('Redis health check failed', { error: error.message });
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  health.checks.memory = {
    status: memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9 ? 'healthy' : 'warning',
    heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    usage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)}%`
  };

  // Overall health status
  health.status = isHealthy ? 'healthy' : 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * Readiness probe for Kubernetes/container orchestration
 * Checks if service is ready to accept traffic
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is accessible
    await db.query('SELECT 1');

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe for Kubernetes/container orchestration
 * Checks if service is alive and should not be restarted
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
```

#### Step 2: CloudWatch Configuration
**File:** `backend/config/cloudwatch.js`

```javascript
const CloudWatchClient = require('@aws-sdk/client-cloudwatch').CloudWatchClient;
const PutMetricDataCommand = require('@aws-sdk/client-cloudwatch').PutMetricDataCommand;
const logger = require('./logger');

const cloudwatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'ap-south-1'
});

const NAMESPACE = 'NurseryManagement';
const environment = process.env.NODE_ENV || 'development';

class CloudWatchMetrics {
  /**
   * Send custom metric to CloudWatch
   */
  async putMetric(metricName, value, unit = 'Count', dimensions = {}) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
      logger.debug('CloudWatch metric (not sent in dev)', {
        metricName,
        value,
        unit,
        dimensions
      });
      return;
    }

    try {
      const params = {
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: [
              {
                Name: 'Environment',
                Value: environment
              },
              ...Object.entries(dimensions).map(([key, val]) => ({
                Name: key,
                Value: String(val)
              }))
            ]
          }
        ]
      };

      const command = new PutMetricDataCommand(params);
      await cloudwatchClient.send(command);

      logger.debug('CloudWatch metric sent', { metricName, value });
    } catch (error) {
      logger.error('Failed to send CloudWatch metric', {
        error: error.message,
        metricName,
        value
      });
    }
  }

  /**
   * Track order creation
   */
  async trackOrderCreated(orderValue, paymentMethod) {
    await this.putMetric('OrdersCreated', 1, 'Count', {
      PaymentMethod: paymentMethod
    });
    await this.putMetric('OrderValue', orderValue, 'None', {
      PaymentMethod: paymentMethod
    });
  }

  /**
   * Track delivery completion
   */
  async trackDeliveryCompleted(deliveryTime) {
    await this.putMetric('DeliveriesCompleted', 1, 'Count');
    await this.putMetric('DeliveryTime', deliveryTime, 'Seconds');
  }

  /**
   * Track API errors
   */
  async trackError(errorType, endpoint) {
    await this.putMetric('APIErrors', 1, 'Count', {
      ErrorType: errorType,
      Endpoint: endpoint
    });
  }

  /**
   * Track API response time
   */
  async trackResponseTime(endpoint, duration, statusCode) {
    await this.putMetric('APIResponseTime', duration, 'Milliseconds', {
      Endpoint: endpoint,
      StatusCode: String(statusCode)
    });
  }

  /**
   * Track database query performance
   */
  async trackDatabaseQuery(queryType, duration) {
    await this.putMetric('DatabaseQueryTime', duration, 'Milliseconds', {
      QueryType: queryType
    });
  }

  /**
   * Track cache hit/miss
   */
  async trackCacheHit(cacheKey, isHit) {
    await this.putMetric(isHit ? 'CacheHits' : 'CacheMisses', 1, 'Count', {
      CacheKey: cacheKey
    });
  }

  /**
   * Track user authentication
   */
  async trackAuthentication(success, method) {
    await this.putMetric(
      success ? 'AuthenticationSuccess' : 'AuthenticationFailure',
      1,
      'Count',
      { Method: method }
    );
  }

  /**
   * Track WhatsApp message sent
   */
  async trackWhatsAppMessage(messageType, success) {
    await this.putMetric(
      success ? 'WhatsAppMessagesSent' : 'WhatsAppMessagesFailed',
      1,
      'Count',
      { MessageType: messageType }
    );
  }
}

module.exports = new CloudWatchMetrics();
```

#### Step 3: CloudWatch Metrics Middleware
**File:** `backend/middleware/cloudwatchMetrics.js`

```javascript
const cloudwatch = require('../config/cloudwatch');
const logger = require('../config/logger');

/**
 * Middleware to track API metrics in CloudWatch
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Track when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Send metrics to CloudWatch
    cloudwatch.trackResponseTime(endpoint, duration, res.statusCode);

    // Track errors
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'ServerError' : 'ClientError';
      cloudwatch.trackError(errorType, endpoint);
    }

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow API request', {
        endpoint,
        duration,
        statusCode: res.statusCode
      });
    }
  });

  next();
}

module.exports = metricsMiddleware;
```

#### Step 4: Update Server.js
**File:** `backend/server.js` (additions)

```javascript
// Add after other middleware
const metricsMiddleware = require('./middleware/cloudwatchMetrics');
app.use(metricsMiddleware);

// Add health routes
const healthRoutes = require('./routes/health');
app.use('/health', healthRoutes);

// Track application start
const cloudwatch = require('./config/cloudwatch');
cloudwatch.putMetric('ApplicationStart', 1, 'Count');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await cloudwatch.putMetric('ApplicationShutdown', 1, 'Count');

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
```

#### Step 5: Terraform CloudWatch Module
**File:** `terraform/modules/cloudwatch/main.tf`

```hcl
# CloudWatch Log Group for Application Logs
resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/aws/ec2/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-logs"
    }
  )
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["NurseryManagement", "OrdersCreated", { stat = "Sum", label = "Orders Created" }],
            [".", "DeliveriesCompleted", { stat = "Sum", label = "Deliveries Completed" }],
            [".", "APIErrors", { stat = "Sum", label = "API Errors" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Business Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["NurseryManagement", "APIResponseTime", { stat = "Average" }],
            ["...", { stat = "p99" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "API Response Time"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { stat = "Average" }],
            [".", "DatabaseConnections", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Database Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", { stat = "Average" }],
            [".", "NetworkIn", { stat = "Sum" }],
            [".", "NetworkOut", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "EC2 Metrics"
        }
      }
    ]
  })
}

# CloudWatch Alarm - High Error Rate
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "APIErrors"
  namespace           = "NurseryManagement"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_description   = "This metric monitors API error rate"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Environment = var.environment
  }

  tags = var.tags
}

# CloudWatch Alarm - High CPU
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This metric monitors EC2 CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

# CloudWatch Alarm - Database Connection Count
resource "aws_cloudwatch_metric_alarm" "high_db_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-high-db-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This metric monitors RDS connection count"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = var.tags
}

# CloudWatch Alarm - Slow API Response Time
resource "aws_cloudwatch_metric_alarm" "slow_response_time" {
  alarm_name          = "${var.project_name}-${var.environment}-slow-response"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "APIResponseTime"
  namespace           = "NurseryManagement"
  period              = 300
  statistic           = "Average"
  threshold           = 2000
  alarm_description   = "This metric monitors API response time"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Environment = var.environment
  }

  tags = var.tags
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"

  tags = var.tags
}

# SNS Topic Subscription
resource "aws_sns_topic_subscription" "email_alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Log Metric Filter - Error Logs
resource "aws_cloudwatch_log_metric_filter" "error_logs" {
  name           = "${var.project_name}-${var.environment}-error-logs"
  log_group_name = aws_cloudwatch_log_group.app_logs.name
  pattern        = "[time, request_id, level = ERROR*, ...]"

  metric_transformation {
    name      = "ErrorLogCount"
    namespace = "NurseryManagement"
    value     = "1"
  }
}
```

### Testing Checklist
- [ ] `/health` endpoint returns 200
- [ ] `/health/detailed` shows all service statuses
- [ ] `/health/ready` checks database connectivity
- [ ] CloudWatch metrics send successfully
- [ ] CloudWatch dashboard displays metrics
- [ ] Alarms trigger on thresholds
- [ ] SNS sends email notifications
- [ ] Log aggregation works in CloudWatch Logs
- [ ] Metric filters capture error logs
- [ ] Response time tracking works

---

## Issue #100: Backup and Disaster Recovery
**Priority:** Critical
**Estimated Time:** 2-3 days
**Dependencies:** #97 (Infrastructure)

### Objectives
Implement automated database backups, disaster recovery procedures, and backup verification processes.

### Implementation Steps

#### Step 1: Database Backup Script
**File:** `scripts/backup-db.sh`

```bash
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
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)

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
  --region "${AWS_REGION}"

echo "[$(date)] Backup completed successfully!"

# Send notification (optional)
if [ -n "${SNS_TOPIC_ARN}" ]; then
  aws sns publish \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Backup Completed Successfully" \
    --message "Database backup completed at $(date). File: ${UPLOAD_FILE}" \
    --region "${AWS_REGION}"
fi

exit 0
```

#### Step 2: Database Restore Script
**File:** `scripts/restore-db.sh`

```bash
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
  --region "${AWS_REGION}"

# Send notification
if [ -n "${SNS_TOPIC_ARN}" ]; then
  aws sns publish \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Database Restore Completed" \
    --message "Database restore completed at $(date). Source: ${BACKUP_FILE}" \
    --region "${AWS_REGION}"
fi

echo "[$(date)] Restore process completed!"
```

#### Step 3: Backup Verification Script
**File:** `scripts/verify-backup.sh`

```bash
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
  --region "${AWS_REGION}"

exit 0
```

#### Step 4: Cron Configuration
**File:** `scripts/setup-backup-cron.sh`

```bash
#!/bin/bash

# Setup daily backup at 2 AM
CRON_JOB="0 2 * * * /opt/nursery/scripts/backup-db.sh >> /var/log/nursery-backup.log 2>&1"

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v backup-db.sh; echo "$CRON_JOB") | crontab -

echo "Backup cron job installed successfully"
echo "Backups will run daily at 2 AM"

# Setup monthly backup verification
VERIFY_JOB="0 3 1 * * /opt/nursery/scripts/verify-backup.sh >> /var/log/nursery-backup-verify.log 2>&1"

(crontab -l 2>/dev/null | grep -v verify-backup.sh; echo "$VERIFY_JOB") | crontab -

echo "Backup verification cron job installed successfully"
echo "Verification will run monthly on the 1st at 3 AM"

# Display installed cron jobs
echo ""
echo "Installed cron jobs:"
crontab -l | grep -E "(backup-db|verify-backup)"
```

#### Step 5: Disaster Recovery Documentation
**File:** `docs/DISASTER_RECOVERY.md`

```markdown
# Disaster Recovery Plan

## Overview
This document outlines the disaster recovery procedures for the Nursery Management System.

## Recovery Objectives
- **Recovery Time Objective (RTO):** 4 hours
- **Recovery Point Objective (RPO):** 24 hours

## Backup Strategy

### Automated Backups
- **Frequency:** Daily at 2:00 AM UTC
- **Retention:** 30 days
- **Storage:** AWS S3 with versioning enabled
- **Encryption:** GPG encryption before upload
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

## Checklist

After any recovery:
- [ ] Verify all services are running
- [ ] Check data integrity
- [ ] Review logs for errors
- [ ] Update incident documentation
- [ ] Notify stakeholders
- [ ] Schedule post-mortem
- [ ] Update DR procedures if needed
```

### Testing Checklist
- [ ] Backup script runs successfully
- [ ] Backup uploads to S3
- [ ] Backup is encrypted
- [ ] Checksum verification works
- [ ] Restore script works with latest backup
- [ ] Restore script works with specific backup
- [ ] Old backups are cleaned up after retention period
- [ ] Cron jobs are configured correctly
- [ ] CloudWatch metrics are sent
- [ ] SNS notifications are received
- [ ] DR documentation is complete and accurate

---

## Testing Strategy

### Local Testing (Development)
1. Test Docker builds locally
2. Test docker-compose setup
3. Verify all services connect properly
4. Test volume mounts and persistence

### Staging Environment Testing
1. Deploy full infrastructure to staging
2. Run automated tests against staging
3. Test monitoring and alerting
4. Perform backup and restore tests
5. Load testing with realistic data

### Production Deployment
1. Deploy outside business hours
2. Use blue-green deployment strategy
3. Monitor closely for first 24 hours
4. Keep previous version ready for rollback

---

## Deployment Sequence

### Phase 1: Foundation (Days 1-3)
1. Create Dockerfiles and test locally
2. Setup docker-compose for development
3. Test all services in containers
4. Document any issues

### Phase 2: Infrastructure (Days 4-7)
1. Create Terraform configurations
2. Provision staging infrastructure
3. Test infrastructure components
4. Setup monitoring and logging

### Phase 3: CI/CD (Days 8-10)
1. Create GitHub Actions workflows
2. Test CI pipeline on feature branch
3. Configure secrets in GitHub
4. Test deployment to staging

### Phase 4: Monitoring (Days 11-12)
1. Implement health check endpoints
2. Setup CloudWatch dashboards
3. Configure alarms and notifications
4. Test alerting mechanisms

### Phase 5: Backup & Recovery (Days 13-14)
1. Create backup scripts
2. Test backup and restore procedures
3. Setup automated backups
4. Document DR procedures

### Phase 6: Production Deployment (Day 15)
1. Deploy to production
2. Monitor for 24 hours
3. Verify all systems operational
4. Complete handover documentation

---

## Risk Assessment

### High Risks
1. **Database Migration Failure**
   - Mitigation: Test migration on staging, keep backup ready
   - Rollback: Restore previous database backup

2. **Network Configuration Issues**
   - Mitigation: Use Terraform to ensure consistent config
   - Rollback: Revert Terraform changes

3. **Performance Degradation**
   - Mitigation: Load test before production
   - Rollback: Scale up resources or rollback deployment

### Medium Risks
1. **Cost Overruns**
   - Mitigation: Use cost calculator, set billing alarms
   - Monitor: Check AWS billing dashboard daily

2. **Security Vulnerabilities**
   - Mitigation: Run security scans in CI/CD
   - Monitor: Regular security audits

3. **Monitoring Gaps**
   - Mitigation: Comprehensive metric coverage
   - Monitor: Review dashboards weekly

### Low Risks
1. **Documentation Gaps**
   - Mitigation: Document as you build
   - Recovery: Update docs post-deployment

---

## Success Criteria

### Docker Containerization (#96)
- [ ] All services run in containers
- [ ] Images are optimized (<200MB each)
- [ ] Health checks pass consistently
- [ ] Local development works with docker-compose

### AWS Infrastructure (#97)
- [ ] All resources provisioned via Terraform
- [ ] Multi-AZ setup for high availability
- [ ] Security groups properly configured
- [ ] Resources tagged appropriately

### CI/CD Pipeline (#98)
- [ ] Tests run automatically on PRs
- [ ] Docker images build and push successfully
- [ ] Deployments work to staging and production
- [ ] Rollback mechanism tested and works

### Monitoring (#99)
- [ ] Health checks return accurate status
- [ ] CloudWatch dashboard shows key metrics
- [ ] Alarms trigger appropriately
- [ ] Logs are searchable in CloudWatch

### Backup & Recovery (#100)
- [ ] Daily backups run automatically
- [ ] Backups are encrypted and secure
- [ ] Restore process tested and documented
- [ ] DR procedures are clear and tested

---

## Post-Deployment Tasks

1. Monitor production for 7 days
2. Tune CloudWatch alarms based on actual metrics
3. Optimize resource allocation
4. Complete knowledge transfer
5. Schedule first DR drill
6. Update runbooks based on learnings

---

## Appendix

### Required AWS Services
- EC2 (Elastic Compute Cloud)
- RDS (Relational Database Service)
- ElastiCache (Redis)
- S3 (Simple Storage Service)
- VPC (Virtual Private Cloud)
- ALB (Application Load Balancer)
- CloudWatch (Monitoring and Logging)
- SNS (Simple Notification Service)
- ECR (Elastic Container Registry)
- Systems Manager (Parameter Store, Session Manager)

### Required Tools
- Docker & Docker Compose
- Terraform v1.0+
- AWS CLI v2
- PostgreSQL client tools
- Git & GitHub CLI

### Estimated Costs (Monthly)
- EC2 (2x t3.small): $30
- RDS (db.t3.micro): $15
- ElastiCache (cache.t3.micro): $12
- S3 (100GB): $3
- Data Transfer: $20
- CloudWatch: $10
- **Total:** ~$90/month (staging and production combined)

---

**Document Version:** 1.0
**Last Updated:** 2024-10-20
**Next Review:** After Phase 20 completion
