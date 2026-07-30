# CloudFront distribution (CdnStack).
#
# CDK creates CdnStack only when custom_domain AND certificate_arn are set.
# Every resource here is gated with count = local.enable_cdn ? 1 : 0.
#
# Serves the frontend (Cloudflare Pages) and the API (API Gateway) under a
# single domain so cookies are first-party.

# ── AWS マネージドポリシー ID (グローバル固定値) ─────────────────────────────
# データソース (cloudfront:ListCachePolicies / ListOriginRequestPolicies) を避け、
# 固定 ID を直接参照する。これらの ID は AWS 全体で不変なので、最小権限の CI
# ユーザーでも plan が通り、CloudFront の List 権限を付与せずに済む。
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
locals {
  cf_cache_policy_optimized_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cf_cache_policy_disabled_id  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cf_orp_all_viewer_no_host_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
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
    domain_name = replace(aws_apigatewayv2_api.http.api_endpoint, "https://", "")

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
    cache_policy_id        = local.cf_cache_policy_optimized_id
  }

  # /api/* → API Gateway.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cf_cache_policy_disabled_id
    origin_request_policy_id = local.cf_orp_all_viewer_no_host_id
  }

  # /.well-known/* → API Gateway (RFC 8414 / RFC 9728 OAuth metadata).
  ordered_cache_behavior {
    path_pattern             = "/.well-known/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cf_cache_policy_disabled_id
    origin_request_policy_id = local.cf_orp_all_viewer_no_host_id
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
