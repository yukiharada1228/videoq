provider "aws" {
  region = var.aws_region
}

# OpenAI Administration API provider. Reads OPENAI_ADMIN_KEY from the environment.
# No admin key is needed when var.manage_openai_project=false because all resources have count=0.
provider "openai" {}
