resource "aws_security_group" "alb" {
  name        = "${var.project}-${var.environment}-alb"
  description = "ALB security group"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "Allow HTTP"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow HTTPS"
}

resource "aws_security_group" "ecs_service" {
  name        = "${var.project}-${var.environment}-ecs-svc"
  description = "ECS service security group"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "svc_from_alb_http" {
  security_group_id            = aws_security_group.ecs_service.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 8000
  to_port                      = 8000
  ip_protocol                  = "tcp"
  description                  = "Allow HTTP from ALB"
}


# Security group for VPC Interface Endpoints (allow HTTPS from VPC)
resource "aws_security_group" "vpce" {
  name        = "${var.project}-${var.environment}-vpce"
  description = "Security group for VPC Interface Endpoints"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "vpce_https_from_ecs" {
  security_group_id            = aws_security_group.vpce.id
  referenced_security_group_id = aws_security_group.ecs_service.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS from ECS tasks to VPC endpoints"
}


