# Terraform state backend (S3 with native locking).
#
# Create the bucket by applying infra/bootstrap once. Locking uses use_lockfile
# with S3 conditional writes (Terraform 1.11+), so DynamoDB is unnecessary.
#
# The bucket name contains the account ID. To keep it out of the public
# repository, omit it from the backend block and inject it at init time with
# -backend-config.
#   - Local: run cp backend.hcl.example backend.hcl, enter the bucket, and then
#               terraform init -backend-config=backend.hcl
#   - CI:       terraform init -backend-config="bucket=$TF_STATE_BUCKET"
# backend.hcl is in .gitignore. The non-sensitive region remains here.

terraform {
  backend "s3" {
    key          = "videoq/prod/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
    # Inject bucket with -backend-config.
  }
}
