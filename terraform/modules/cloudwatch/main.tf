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
