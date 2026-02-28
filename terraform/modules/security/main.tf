# Security Groups Module - Main Configuration

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-${var.environment}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-alb-sg"
      Type = "ALB"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# ALB Ingress Rules
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTP traffic from internet"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-alb-http-ingress"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow HTTPS traffic from internet"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-alb-https-ingress"
    }
  )
}

# ALB Egress Rule
resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Allow all outbound traffic"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-alb-all-egress"
    }
  )
}

# EC2 Security Group
resource "aws_security_group" "ec2" {
  name_prefix = "${var.project_name}-${var.environment}-ec2-"
  description = "Security group for EC2 instances"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-ec2-sg"
      Type = "EC2"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# EC2 Ingress Rules
resource "aws_vpc_security_group_ingress_rule" "ec2_app_from_alb" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow application traffic from ALB"

  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 5000
  to_port                      = 5000
  ip_protocol                  = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-ec2-app-ingress"
    }
  )
}

resource "aws_vpc_security_group_ingress_rule" "ec2_ssh" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow SSH access from specific IP"

  cidr_ipv4   = var.ssh_allowed_cidr
  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-ec2-ssh-ingress"
    }
  )
}

# EC2 Egress Rule
resource "aws_vpc_security_group_egress_rule" "ec2_all" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow all outbound traffic"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-ec2-all-egress"
    }
  )
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.environment}-rds-"
  description = "Security group for RDS PostgreSQL database"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-sg"
      Type = "RDS"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# RDS Ingress Rule
resource "aws_vpc_security_group_ingress_rule" "rds_postgres_from_ec2" {
  security_group_id = aws_security_group.rds.id
  description       = "Allow PostgreSQL traffic from EC2 instances"

  referenced_security_group_id = aws_security_group.ec2.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-postgres-ingress"
    }
  )
}

# RDS Egress Rule
resource "aws_vpc_security_group_egress_rule" "rds_all" {
  security_group_id = aws_security_group.rds.id
  description       = "Allow all outbound traffic"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-all-egress"
    }
  )
}

# Redis Security Group
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  description = "Security group for Redis ElastiCache"
  vpc_id      = var.vpc_id

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-redis-sg"
      Type = "Redis"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Redis Ingress Rule
resource "aws_vpc_security_group_ingress_rule" "redis_from_ec2" {
  security_group_id = aws_security_group.redis.id
  description       = "Allow Redis traffic from EC2 instances"

  referenced_security_group_id = aws_security_group.ec2.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-redis-ingress"
    }
  )
}

# Redis Egress Rule
resource "aws_vpc_security_group_egress_rule" "redis_all" {
  security_group_id = aws_security_group.redis.id
  description       = "Allow all outbound traffic"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-redis-all-egress"
    }
  )
}
