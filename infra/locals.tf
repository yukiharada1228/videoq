locals {
  # リソース命名のプレフィックス
  name_prefix = "videoq"

  # CloudFront CDN を有効化する条件 (カスタムドメイン + 証明書 ARN が両方設定済み)
  enable_cdn = var.custom_domain != "" && var.certificate_arn != ""

  # フロントエンド URL (custom_domain > pages_domain > ローカル開発の優先順位)
  frontend_url = (
    var.custom_domain != "" ? "https://${var.custom_domain}" : (
      var.pages_domain != "" ? "https://${var.pages_domain}" : "http://localhost:3000"
    )
  )

  # CORS 許可オリジンのリスト (custom_domain / pages_domain の https オリジン)
  # allowCredentials=True (JWT Cookie) は allowOrigin="*" と併用不可のため、
  # 未設定時はローカル開発用オリジンをデフォルトとする。
  _origins = compact([
    var.custom_domain != "" ? "https://${var.custom_domain}" : "",
    var.pages_domain != "" ? "https://${var.pages_domain}" : "",
  ])

  # 環境変数 CORS_ALLOWED_ORIGINS 用のカンマ区切り文字列
  cors_origins = (
    length(local._origins) > 0
    ? join(",", local._origins)
    : "http://localhost:3000,http://localhost:5173"
  )

  # API Gateway CORS allow_origins 用のリスト
  allow_origins = (
    length(local._origins) > 0
    ? local._origins
    : ["http://localhost:3000", "http://localhost:5173"]
  )

  # API Gateway プロキシ数 (CloudFront + API Gateway = 2、単体は 1)
  num_proxies = var.custom_domain != "" ? "2" : "1"
}
