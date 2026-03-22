import aws_cdk as cdk
from aws_cdk import (
    Stack,
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
)
from constructs import Construct

from config.settings import VideoQConfig


class CdnStack(Stack):
    """
    CloudFront ディストリビューション。

    フロントエンド (Cloudflare Pages) と API (API Gateway) を
    同一ドメインで配信し、Cookie をファーストパーティにすることで
    モバイルブラウザの 403 エラーを解消する。
    """

    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig,
                 api_endpoint: str,
                 pages_domain: str,
                 **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── ACM 証明書 (us-east-1 で事前作成済み) ─────────────────────────
        certificate = acm.Certificate.from_certificate_arn(
            self, "Certificate", config.certificate_arn,
        )

        # ── API Gateway オリジン ──────────────────────────────────────────
        # api_endpoint はCDKトークンなので CloudFormation 組み込み関数でドメインを抽出
        # "https://xxx.execute-api.ap-northeast-1.amazonaws.com" → "xxx.execute-api..."
        api_domain = cdk.Fn.select(1, cdk.Fn.split("//", api_endpoint))
        api_origin = origins.HttpOrigin(api_domain,
            protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        )

        # ── Cloudflare Pages オリジン ─────────────────────────────────────
        pages_origin = origins.HttpOrigin(pages_domain,
            protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        )

        # ── CloudFront ディストリビューション ─────────────────────────────
        self.distribution = cloudfront.Distribution(self, "Distribution",
            domain_names=[config.custom_domain],
            certificate=certificate,
            default_behavior=cloudfront.BehaviorOptions(
                origin=pages_origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            additional_behaviors={
                "/api/*": cloudfront.BehaviorOptions(
                    origin=api_origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                    origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                ),
            },
        )

        # ── Outputs ──────────────────────────────────────────────────────
        cdk.CfnOutput(self, "DistributionDomainName",
            value=self.distribution.distribution_domain_name,
            description="CloudFront ドメイン (DNS の CNAME/ALIAS 先)",
        )
        cdk.CfnOutput(self, "DistributionId",
            value=self.distribution.distribution_id,
            description="CloudFront ディストリビューション ID",
        )
