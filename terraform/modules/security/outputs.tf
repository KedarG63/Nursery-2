# Security Groups Module - Outputs

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "alb_security_group_name" {
  description = "Name of the ALB security group"
  value       = aws_security_group.alb.name
}

output "ec2_security_group_id" {
  description = "ID of the EC2 security group"
  value       = aws_security_group.ec2.id
}

output "ec2_security_group_name" {
  description = "Name of the EC2 security group"
  value       = aws_security_group.ec2.name
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "rds_security_group_name" {
  description = "Name of the RDS security group"
  value       = aws_security_group.rds.name
}

output "redis_security_group_id" {
  description = "ID of the Redis security group"
  value       = aws_security_group.redis.id
}

output "redis_security_group_name" {
  description = "Name of the Redis security group"
  value       = aws_security_group.redis.name
}

output "all_security_group_ids" {
  description = "Map of all security group IDs"
  value = {
    alb   = aws_security_group.alb.id
    ec2   = aws_security_group.ec2.id
    rds   = aws_security_group.rds.id
    redis = aws_security_group.redis.id
  }
}
