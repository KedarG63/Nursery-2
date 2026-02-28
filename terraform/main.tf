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

  project_name         = local.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
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

  project_name            = local.project_name
  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  db_subnet_ids           = module.vpc.private_subnet_ids
  db_security_group_ids   = [module.security.rds_security_group_id]
  db_instance_class       = var.db_instance_class
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password             = var.db_password
  backup_retention_period = var.backup_retention_period

  tags = local.common_tags
}

# ElastiCache Redis Module
module "redis" {
  source = "./modules/redis"

  project_name       = local.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.security.redis_security_group_id]
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_nodes

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

  project_name       = local.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.security.ec2_security_group_id]
  instance_type      = var.ec2_instance_type
  key_name           = var.ec2_key_name
  min_size           = var.asg_min_size
  max_size           = var.asg_max_size
  desired_capacity   = var.asg_desired_capacity
  target_group_arn   = module.alb.target_group_arn

  # User data for EC2 initialization
  user_data = templatefile("${path.module}/scripts/user-data.sh", {
    db_host        = module.rds.db_endpoint
    db_name        = var.db_name
    db_username    = var.db_username
    redis_endpoint = module.redis.redis_endpoint
    s3_bucket      = module.s3.bucket_name
    aws_region     = var.aws_region
  })

  tags = local.common_tags
}

# CloudWatch Module
module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name       = local.project_name
  environment        = var.environment
  aws_region         = var.aws_region
  log_retention_days = 30
  alert_email        = var.alert_email

  tags = local.common_tags
}
