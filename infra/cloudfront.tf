# CloudFront distribution.
#
# Serves the frontend (Cloudflare Pages) and the API (API Gateway) under a
# single domain so cookies are first-party.

# ── AWS managed policies ─────────────────────────────────────────────────────
# 名前でマネージドポリシーを解決する (List で名前→ID、Get で詳細取得の 2 段階)。
# CI ユーザーには以下 4 つの読み取り権限が必要:
#   cloudfront:ListCachePolicies / GetCachePolicy
#   cloudfront:ListOriginRequestPolicies / GetOriginRequestPolicy
data "aws_cloudfront_cache_policy" "caching_optimized" {
  count = local.enable_cdn ? 1 : 0
  name  = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  count = local.enable_cdn ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  count = local.enable_cdn ? 1 : 0
  name  = "Managed-AllViewerExceptHostHeader"
}

# ── Distribution ─────────────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "this" {
  count = local.enable_cdn ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  aliases         = [var.custom_domain]

  # Cloudflare Pages origin (frontend).
  origin {
    origin_id   = "pages"
    domain_name = var.pages_domain

    custom_origin_config {
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      http_port              = 80
      https_port             = 443
    }
  }

  # API Gateway origin. Strip the "https://" scheme from the api_endpoint.
  origin {
    origin_id   = "api"
    domain_name = trimprefix(aws_apigatewayv2_api.http.api_endpoint, "https://")

    custom_origin_config {
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      http_port              = 80
      https_port             = 443
    }
  }

  # Default → frontend (Cloudflare Pages).
  default_cache_behavior {
    target_origin_id       = "pages"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized[0].id
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.api_path_patterns

    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "api"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled[0].id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header[0].id
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
