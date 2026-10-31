"""Inspect AWS/OpenRouter trust inputs without logging JWTs. No writes by default."""
import argparse
import base64
from contextlib import closing
import json
import sys


def workload_inventory(iam):
    """Report project IAM subjects and last-used services, never access key IDs/values."""
    result = {"apiCandidates": []}
    try:
        result["workerSubject"] = iam.get_role(RoleName="videoq-worker-prod")["Role"]["Arn"]
        for page in iam.get_paginator("list_users").paginate():
            for user in page.get("Users", []):
                name = user["UserName"]
                inline = iam.list_user_policies(UserName=name).get("PolicyNames", [])
                attached = iam.list_attached_user_policies(UserName=name).get("AttachedPolicies", [])
                labels = [name, *inline, *[p["PolicyName"] for p in attached]]
                if not any("videoq" in label.lower() or "cloudflare" in label.lower() for label in labels):
                    continue
                services = set()
                for key in iam.list_access_keys(UserName=name).get("AccessKeyMetadata", []):
                    if key.get("Status") == "Active":
                        usage = iam.get_access_key_last_used(AccessKeyId=key["AccessKeyId"])
                        services.add(usage.get("AccessKeyLastUsed", {}).get("ServiceName", "unknown"))
                result["apiCandidates"].append({"subject": user["Arn"], "lastUsedServices": sorted(services)})
    except Exception as error:
        result["inventoryErrorType"] = type(error).__name__
    return result


def inspect_identity(session, *, enable=False, probe=False, audience="https://openrouter.ai", region=None, workloads=False):
    if session.get_credentials() is None:
        return {"status": "missing_aws_credentials"}
    region = region or session.region_name
    if not region:
        return {"status": "missing_aws_region"}
    from botocore.config import Config
    config = Config(connect_timeout=10, read_timeout=10, retries={"max_attempts": 0})
    with closing(session.client("iam", config=config)) as iam:
        try:
            info = iam.get_outbound_web_identity_federation_info()
        except Exception as error:
            # IAM returns FeatureDisabled (404) before the account has an issuer.
            if getattr(error, "response", {}).get("Error", {}).get("Code") != "FeatureDisabled":
                raise
            info = {"JwtVendingEnabled": False}
        if not info.get("JwtVendingEnabled"):
            if not enable:
                return {"status": "aws_federation_disabled", "next": "An AWS administrator must enable outbound web identity federation, or run this command with --enable."}
            info = iam.enable_outbound_web_identity_federation()
        result = {"status": "issuer_ready", "issuer": info["IssuerIdentifier"], "audience": audience}
        if workloads:
            result["workloads"] = workload_inventory(iam)
    if probe:
        # Sub is read from AWS's actual JWT, not guessed from an assumed-role session ARN.
        with closing(session.client("sts", region_name=region, endpoint_url=f"https://sts.{region}.amazonaws.com", config=config)) as sts:
            token = sts.get_web_identity_token(Audience=[audience], SigningAlgorithm="RS256", DurationSeconds=900)["WebIdentityToken"]
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if claims.get("iss") != result["issuer"] or audience not in (
                claims["aud"] if isinstance(claims.get("aud"), list) else [claims.get("aud")]):
            raise ValueError("AWS subject token claims disagree with issuer/audience")
        result.update(status="subject_ready", subject=claims["sub"], expiresAt=claims["exp"])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region")
    parser.add_argument("--audience", default="https://openrouter.ai")
    parser.add_argument("--enable", action="store_true", help="Enable AWS account outbound identity federation if disabled (account write).")
    parser.add_argument("--workloads", action="store_true", help="Report VideoQ role and candidate API IAM subjects; no keys are printed.")
    parser.add_argument("--probe", action="store_true", help="Mint an AWS JWT and print its trust claims only, never the token.")
    args = parser.parse_args()
    try:
        import boto3
        result = inspect_identity(boto3.Session(), enable=args.enable, probe=args.probe,
                                  audience=args.audience, region=args.region, workloads=args.workloads)
    except Exception as error:
        # SDK diagnostics can include request/authentication details.
        code = getattr(error, "response", {}).get("Error", {}).get("Code", "")
        result = {"status": "aws_identity_check_failed", "errorType": type(error).__name__}
        if code in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation"}:
            result["next"] = "AWS administrator must grant IAM outbound-federation inspection/enable permission and STS token permission for this setup operation."
    print(json.dumps(result))
    return 0 if result["status"] in {"issuer_ready", "subject_ready"} else 1


if __name__ == "__main__":
    sys.exit(main())
