variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "log_retention_days" {
  type = number
}

variable "alert_email" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
