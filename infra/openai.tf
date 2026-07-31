# Manage OpenAI project governance with Terraform (openai/openai provider).
# Define the OpenAI organization project used for embeddings, LLMs, and
# transcription as infrastructure as code.
#
# Note: This provider cannot manage API keys. Continue issuing the runtime
# OPENAI_API_KEY manually from the dashboard and saving it in the app secret
# (secrets.tf).
#
# While var.manage_openai_project is false (the default), every resource has
# count=0, so plan/apply works without OPENAI_ADMIN_KEY. Set the variable to true
# and export the admin key to enable management.

resource "openai_project" "videoq" {
  count = var.manage_openai_project ? 1 : 0
  name  = "${local.name_prefix}-${var.env_name}"
}

# Limit access to models that VideoQ actually calls as a cost guardrail.
resource "openai_project_model_permissions" "videoq" {
  count      = var.manage_openai_project ? 1 : 0
  project_id = openai_project.videoq[0].project_id
  mode       = "allow_list"
  model_ids  = var.openai_allowed_models
}

# Send an email when monthly spend exceeds the threshold as a budget guardrail.
# Note: threshold_amount uses the smallest currency unit (cents for USD); testing
# confirmed that 50 means $0.50. Because currency is fixed to USD, pass
# var (in dollars) * 100 according to the definition of 100 cents per dollar.
resource "openai_project_spend_alert" "videoq" {
  count                           = var.manage_openai_project && var.openai_spend_alert_email != "" ? 1 : 0
  project_id                      = openai_project.videoq[0].project_id
  threshold_amount                = var.openai_spend_threshold_usd * 100
  currency                        = "USD"
  interval                        = "month"
  notification_channel_type       = "email"
  notification_channel_recipients = [var.openai_spend_alert_email]
}
