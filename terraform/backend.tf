# Terraform state backend configuration
# Uncomment and configure for remote state storage

# terraform {
#   backend "s3" {
#     bucket         = "nursery-terraform-state"
#     key            = "terraform.tfstate"
#     region         = "ap-south-1"
#     encrypt        = true
#     dynamodb_table = "nursery-terraform-locks"
#   }
# }
