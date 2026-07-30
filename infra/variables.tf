variable "aws_region" {
  description = "リソースをデプロイする AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "env_name" {
  description = "環境名 (リソース命名に使用)"
  type        = string
  default     = "prod"
}

variable "api_lambda_memory_mb" {
  description = "API Lambda のメモリサイズ (MB)"
  type        = number
  default     = 1024
}

variable "api_lambda_timeout_seconds" {
  description = "API Lambda のタイムアウト (秒)"
  type        = number
  default     = 30
}

variable "worker_lambda_memory_mb" {
  description = "Worker Lambda のメモリサイズ (MB) (ffmpeg + AI 推論でメモリを多く使う)"
  type        = number
  default     = 5120
}

variable "worker_lambda_timeout_seconds" {
  description = "Worker Lambda のタイムアウト (秒) (Lambda 最大 15 分)"
  type        = number
  default     = 900
}

variable "sqs_visibility_timeout_seconds" {
  description = "SQS の visibility timeout (秒) (worker_lambda_timeout_seconds 以上に設定すること)"
  type        = number
  default     = 960
}

variable "sqs_max_receive_count" {
  description = "SQS のメッセージ最大受信回数 (超過で DLQ へ送信)"
  type        = number
  default     = 3
}

variable "pages_domain" {
  description = "Cloudflare Pages ドメイン (CORS 許可リストに追加、空文字で未設定)"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "CloudFront カスタムドメイン (例: videoq.jp、空文字で未設定)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM 証明書 ARN (us-east-1 で作成必須、空文字で未設定)"
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Lambda が参照する ECR コンテナイメージのタグ"
  type        = string
  default     = "latest"
}
