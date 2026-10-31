"""Exchange AWS workload identity for an in-memory, short-lived OpenRouter token."""
import base64
from contextlib import closing
import json
import math
import os
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

_LOCK = threading.Lock()
_CACHE: tuple[tuple[str, str, str], str, float] | None = None


def openrouter_token() -> str:
    global _CACHE
    policy = os.environ.get("OPENROUTER_FEDERATION_POLICY_ID", "")
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "")
    audience = os.environ.get("OPENROUTER_FEDERATION_AUDIENCE") or "https://openrouter.ai"
    if not policy or not region:
        raise RuntimeError("OpenRouter federation requires a policy ID and AWS_REGION")
    config = (policy, region, audience)
    with _LOCK:
        if _CACHE and _CACHE[0] == config and _CACHE[2] > time.time() + 60:
            return _CACHE[1]
        try:
            import boto3
            from botocore.config import Config

            started = time.time()
            # Lambda uses its execution role; local development uses the SDK credential chain.
            with closing(boto3.client("sts", region_name=region,
                                     endpoint_url=f"https://sts.{region}.amazonaws.com",
                                     config=Config(connect_timeout=10, read_timeout=10, retries={"max_attempts": 0}))) as sts:
                result = sts.get_web_identity_token(Audience=[audience], SigningAlgorithm="RS256", DurationSeconds=900)
            jwt = result["WebIdentityToken"]
            if not isinstance(jwt, str) or len(jwt) > 16384:
                raise ValueError("Invalid STS token")
            encoded = jwt.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            source_expiry = float(claims["exp"])
            if not math.isfinite(source_expiry) or source_expiry <= time.time() + 60:
                raise ValueError("Expired STS token")
            body = urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                              "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
                              "federation_policy_id": policy, "subject_token": jwt, "scope": "inference"}).encode()
            request = Request("https://openrouter.ai/api/v1/oauth/token", data=body,
                              headers={"content-type": "application/x-www-form-urlencoded"}, method="POST")
            with urlopen(request, timeout=10) as response:
                token = json.load(response)
            duration = token.get("expires_in")
            if (not isinstance(token.get("access_token"), str) or not token["access_token"]
                    or token.get("token_type") != "Bearer" or token.get("scope") != "inference"
                    or type(duration) not in (int, float) or not 60 < duration <= 900):
                raise ValueError("Invalid exchange response")
            expires = min(started + duration, source_expiry)
            if not expires > time.time() + 60:
                raise ValueError("Expired exchange response")
            _CACHE = (config, token["access_token"], expires)
            return token["access_token"]
        except HTTPError as error:
            error.close()
            raise RuntimeError("OpenRouter workload identity exchange rejected") from None
        except Exception:
            # SDK and HTTP exceptions can contain JWTs and signed requests.
            raise RuntimeError("OpenRouter workload identity exchange failed; check issuer, IAM permission and federation policy") from None
