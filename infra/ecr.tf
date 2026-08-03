# ── ECR: Worker Lambda ───────────────────────────────────────────────────────
resource "aws_ecr_repository" "worker" {
  name         = local.names.worker
  force_delete = true
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name
  policy     = local.ecr_lifecycle_policy
}
