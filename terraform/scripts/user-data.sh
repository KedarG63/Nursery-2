#!/bin/bash
set -e

# Update system
yum update -y

# Install Docker
amazon-linux-extras install docker -y
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm
rm amazon-cloudwatch-agent.rpm

# Create application directory
mkdir -p /home/ec2-user/nursery-app
cd /home/ec2-user/nursery-app

# Create .env file
cat > .env <<EOF
NODE_ENV=production
DB_HOST=${db_host}
DB_NAME=${db_name}
DB_USER=${db_username}
REDIS_HOST=${redis_endpoint}
S3_BUCKET=${s3_bucket}
AWS_REGION=${aws_region}
EOF

# Pull and run Docker containers (to be configured via deployment)
echo "EC2 instance initialized successfully"
