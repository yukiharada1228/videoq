resource "aws_route53_zone" "primary" {
  name = var.zone_domain
}

# ACM DNS validation records in Route53
resource "aws_route53_record" "acm_validation" {
  for_each = { for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
    name   = dvo.resource_record_name
    type   = dvo.resource_record_type
    record = dvo.resource_record_value
  } }

  zone_id = aws_route53_zone.primary.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

# A (Alias) record to ALB
resource "aws_route53_record" "app_alb" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.web.dns_name
    zone_id                = aws_lb.web.zone_id
    evaluate_target_health = false
  }
}

output "route53_ns" {
  description = "Update domain registrar to these name servers"
  value       = aws_route53_zone.primary.name_servers
}


