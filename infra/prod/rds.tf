resource "random_password" "rds_master" {
  length  = 16
  special = false
}

resource "aws_db_subnet_group" "rds" {
  name       = "${var.project}-${var.environment}-rds-subnets"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds"
  description = "RDS security group"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ecs_service.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Allow Postgres from ECS service"
}

resource "aws_db_instance" "postgres" {
  identifier                 = "${var.project}-${var.environment}-pg"
  engine                     = "postgres"
  instance_class             = "db.t4g.micro"
  allocated_storage          = 20
  storage_type               = "gp3"
  storage_encrypted          = true
  max_allocated_storage      = 100
  db_name                    = var.db_name
  username                   = var.db_username
  password                   = random_password.rds_master.result
  port                       = 5432
  publicly_accessible        = false
  vpc_security_group_ids     = [aws_security_group.rds.id]
  db_subnet_group_name       = aws_db_subnet_group.rds.name
  multi_az                   = var.rds_multi_az
  backup_retention_period    = 7
  copy_tags_to_snapshot      = true
  skip_final_snapshot        = false
  deletion_protection        = true
  auto_minor_version_upgrade = true
  apply_immediately          = false
}


