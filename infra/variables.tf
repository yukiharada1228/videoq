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

variable "image_tag" {
  description = "Lambda が参照する ECR コンテナイメージのタグ"
  type        = string
  default     = "latest"
}

variable "manage_openai_project" {
  description = "OpenAI プロジェクトのガバナンスを Terraform で管理するか (true で有効化。要 OPENAI_ADMIN_KEY)"
  type        = bool
  default     = true
}

variable "openai_allowed_models" {
  description = "OpenAI プロジェクトで許可するモデル ID の一覧 (videoq が実際に使うモデルのみ)"
  type        = list(string)
  default     = ["text-embedding-3-small", "gpt-4o-mini", "whisper-1"]
}

variable "openai_spend_alert_email" {
  description = "月次スペンドアラートの通知先メールアドレス (空文字でアラート無効)"
  type        = string
  default     = ""
}

variable "openai_spend_threshold_usd" {
  description = "月次スペンドアラートのしきい値 (USD)"
  type        = number
  default     = 50
}
