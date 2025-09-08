resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-${var.environment}-redis-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "redis" {
  name        = "${var.project}-${var.environment}-redis"
  description = "ElastiCache Redis security group"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.ecs_service.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  description                  = "Allow Redis from ECS service"
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.project}-${var.environment}-redis"
  description                = "Redis for ${var.project}-${var.environment}"
  engine                     = "redis"
  engine_version             = "7.0"
  parameter_group_name       = "default.redis7"
  node_type                  = "cache.t4g.micro"
  port                       = 6379
  automatic_failover_enabled = false
  multi_az_enabled           = false
  num_cache_clusters         = 1
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = false
  transit_encryption_enabled = false
}


