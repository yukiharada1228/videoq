terraform {
  required_version = ">= 1.3.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "network"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
  name_prefix = "${var.project}-${var.environment}"
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

resource "aws_eip" "nat" {
  count      = 1
  domain     = "vpc"
  depends_on = [aws_internet_gateway.this]
  tags = {
    Name = "${local.name_prefix}-eip-nat-${count.index + 1}"
  }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name_prefix}-subnet-public-${local.azs[count.index]}"
    Tier = "public"
    AZ   = local.azs[count.index]
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]
  tags = {
    Name = "${local.name_prefix}-subnet-private-${local.azs[count.index]}"
    Tier = "private"
    AZ   = local.azs[count.index]
  }
}

resource "aws_nat_gateway" "this" {
  count         = 1
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.this]
  tags = {
    Name = "${local.name_prefix}-nat-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${local.name_prefix}-rt-public"
    Tier = "public"
  }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = 2
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${local.name_prefix}-rt-private-${local.azs[count.index]}"
    Tier = "private"
    AZ   = local.azs[count.index]
  }
}

resource "aws_route" "private_nat" {
  count                  = length(local.azs)
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Gateway Endpoint for S3 to avoid NAT data processing for S3 access
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAppBucketOnly"
        Effect    = "Allow"
        Principal = "*"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.app.arn,
          "${aws_s3_bucket.app.arn}/*"
        ]
      }
    ]
  })
  tags = {
    Name = "${local.name_prefix}-vpce-s3"
  }
}

# Interface VPC Endpoints to keep AWS service traffic private
resource "aws_vpc_endpoint" "ecr_api" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-ecr-api" }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-ecr-dkr" }
}

resource "aws_vpc_endpoint" "logs" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-logs" }
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-secretsmanager" }
}



resource "aws_vpc_endpoint" "ecs" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-ecs" }
}

resource "aws_vpc_endpoint" "ecs_telemetry" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecs-telemetry"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.vpce.id]
  subnet_ids          = aws_subnet.private[*].id
  tags                = { Name = "${local.name_prefix}-vpce-ecs-telemetry" }
}

# CloudWatch Metrics (PutMetricData) Interface Endpoint


# Tag the VPC's default (main) route table for clarity
resource "aws_default_route_table" "main" {
  default_route_table_id = aws_vpc.main.default_route_table_id
  tags = {
    Name = "${local.name_prefix}-rt-main"
    Tier = "default"
  }
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}


