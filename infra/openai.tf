# OpenAI プロジェクトのガバナンスを Terraform で管理する (openai/openai プロバイダ)。
# 埋め込み / LLM / 文字起こしに使う OpenAI 組織プロジェクトの設定を IaC 化する。
#
# 注意: このプロバイダは API キーを管理できない。ランタイムの OPENAI_API_KEY は
# 従来どおりダッシュボードで手動発行し、app シークレット (secrets.tf) に手動保存する。
#
# var.manage_openai_project = false (デフォルト) の間は全リソース count=0 なので
# OPENAI_ADMIN_KEY 無しで plan/apply できる。true にして Admin キーを export すると有効化。

resource "openai_project" "videoq" {
  count = var.manage_openai_project ? 1 : 0
  name  = "${local.name_prefix}-${var.env_name}"
}

# videoq が実際に呼ぶモデルだけに制限する (コストガードレール)。
resource "openai_project_model_permissions" "videoq" {
  count      = var.manage_openai_project ? 1 : 0
  project_id = openai_project.videoq[0].project_id
  mode       = "allow_list"
  model_ids  = var.openai_allowed_models
}

# 月次スペンドがしきい値を超えたらメール通知する (予算ガードレール)。
resource "openai_project_spend_alert" "videoq" {
  count                           = var.manage_openai_project && var.openai_spend_alert_email != "" ? 1 : 0
  project_id                      = openai_project.videoq[0].project_id
  threshold_amount                = var.openai_spend_threshold_usd
  currency                        = "USD"
  interval                        = "month"
  notification_channel_type       = "email"
  notification_channel_recipients = [var.openai_spend_alert_email]
}
