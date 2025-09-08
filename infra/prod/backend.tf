terraform {
  backend "s3" {
    bucket         = "videoq-tfstate-535002863430-ap-northeast-1"
    key            = "prod/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "videoq-tf-lock-prod"
    encrypt        = true
  }
}


