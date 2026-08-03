"""R2 credentials must not be swallowed by Lambda execution-role env vars."""

from __future__ import annotations

import worker_python.secrets_bootstrap as bootstrap


def test_app_secret_maps_aws_keys_to_r2(monkeypatch):
    bootstrap._LOADED = False
    monkeypatch.setenv("APP_SECRET_ARN", "arn:aws:secretsmanager:ap-northeast-1:1:secret:app")
    # Lambda always injects role credentials under these reserved names.
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ASIA_ROLE_EXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "role-secret")
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("DB_SECRET_ARN", raising=False)

    class FakeClient:
        def get_secret_value(self, SecretId):  # noqa: N803
            assert SecretId.endswith("secret:app")
            return {
                "SecretString": (
                    '{"AWS_ACCESS_KEY_ID":"AKIA_R2","AWS_SECRET_ACCESS_KEY":"r2-secret",'
                    '"AWS_STORAGE_BUCKET_NAME":"videoq-media-prod",'
                    '"AWS_S3_ENDPOINT_URL":"https://example.r2.cloudflarestorage.com",'
                    '"AWS_S3_REGION_NAME":"auto"}'
                )
            }

    class FakeBoto3:
        def client(self, _name):
            return FakeClient()

    monkeypatch.setitem(__import__("sys").modules, "boto3", FakeBoto3())
    bootstrap.ensure_secrets_loaded()

    assert __import__("os").environ["AWS_ACCESS_KEY_ID"] == "ASIA_ROLE_EXAMPLE"
    assert __import__("os").environ["R2_ACCESS_KEY_ID"] == "AKIA_R2"
    assert __import__("os").environ["R2_SECRET_ACCESS_KEY"] == "r2-secret"
    assert __import__("os").environ["AWS_STORAGE_BUCKET_NAME"] == "videoq-media-prod"
