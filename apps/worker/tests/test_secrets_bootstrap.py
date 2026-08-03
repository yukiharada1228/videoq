"""R2 credentials must use R2_* names, never Lambda reserved AWS_ACCESS_KEY_ID."""

from __future__ import annotations

import os

import worker_python.secrets_bootstrap as bootstrap


def test_canonical_r2_keys_from_app_secret(monkeypatch):
    bootstrap._LOADED = False
    monkeypatch.setenv("APP_SECRET_ARN", "arn:aws:secretsmanager:ap-northeast-1:1:secret:app")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ASIA_ROLE_EXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "role-secret")
    for key in (
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_S3_ENDPOINT",
        "R2_S3_REGION",
        "AWS_STORAGE_BUCKET_NAME",
        "AWS_S3_ENDPOINT_URL",
        "AWS_S3_REGION_NAME",
        "DB_SECRET_ARN",
    ):
        monkeypatch.delenv(key, raising=False)

    class FakeClient:
        def get_secret_value(self, SecretId):  # noqa: N803
            assert SecretId.endswith("secret:app")
            return {
                "SecretString": (
                    '{"R2_ACCESS_KEY_ID":"AKIA_R2","R2_SECRET_ACCESS_KEY":"r2-secret",'
                    '"R2_BUCKET_NAME":"videoq-media-prod",'
                    '"R2_S3_ENDPOINT":"https://example.r2.cloudflarestorage.com",'
                    '"R2_S3_REGION":"auto"}'
                )
            }

    class FakeBoto3:
        def client(self, _name):
            return FakeClient()

    monkeypatch.setitem(__import__("sys").modules, "boto3", FakeBoto3())
    bootstrap.ensure_secrets_loaded()

    assert os.environ["AWS_ACCESS_KEY_ID"] == "ASIA_ROLE_EXAMPLE"
    assert os.environ["R2_ACCESS_KEY_ID"] == "AKIA_R2"
    assert os.environ["R2_SECRET_ACCESS_KEY"] == "r2-secret"
    assert os.environ["R2_BUCKET_NAME"] == "videoq-media-prod"
    assert os.environ["R2_S3_ENDPOINT"] == "https://example.r2.cloudflarestorage.com"
    # Legacy mirrors for older call sites.
    assert os.environ["AWS_STORAGE_BUCKET_NAME"] == "videoq-media-prod"
    assert os.environ["AWS_S3_ENDPOINT_URL"] == "https://example.r2.cloudflarestorage.com"


def test_legacy_aws_secret_keys_map_to_r2(monkeypatch):
    bootstrap._LOADED = False
    monkeypatch.setenv("APP_SECRET_ARN", "arn:aws:secretsmanager:ap-northeast-1:1:secret:app")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ASIA_ROLE_EXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "role-secret")
    for key in (
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "DB_SECRET_ARN",
    ):
        monkeypatch.delenv(key, raising=False)

    class FakeClient:
        def get_secret_value(self, SecretId):  # noqa: N803
            return {
                "SecretString": (
                    '{"AWS_ACCESS_KEY_ID":"AKIA_LEGACY","AWS_SECRET_ACCESS_KEY":"legacy",'
                    '"AWS_STORAGE_BUCKET_NAME":"videoq-media-prod"}'
                )
            }

    class FakeBoto3:
        def client(self, _name):
            return FakeClient()

    monkeypatch.setitem(__import__("sys").modules, "boto3", FakeBoto3())
    bootstrap.ensure_secrets_loaded()

    assert os.environ["AWS_ACCESS_KEY_ID"] == "ASIA_ROLE_EXAMPLE"
    assert os.environ["R2_ACCESS_KEY_ID"] == "AKIA_LEGACY"
    assert os.environ["R2_BUCKET_NAME"] == "videoq-media-prod"
