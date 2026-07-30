provider "aws" {
  region = var.aws_region
}

# CloudFront は us-east-1 の ACM 証明書を要求するが、この構成では証明書を
# ARN (var.certificate_arn) で参照するだけなので、us-east-1 用の追加 provider
# は不要。
