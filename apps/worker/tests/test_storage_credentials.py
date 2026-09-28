from contextlib import closing
from urllib.parse import parse_qs, urlsplit

import boto3
import pytest

from worker_python.pipeline import storage


@pytest.fixture(autouse=True)
def isolated_aws_credentials(monkeypatch, tmp_path):
    for name in (
        "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_S3_ENDPOINT", "R2_S3_REGION",
        "AWS_S3_ACCESS_KEY_ID", "AWS_S3_SECRET_ACCESS_KEY", "AWS_S3_ENDPOINT_URL",
        "AWS_S3_ENDPOINT", "AWS_S3_REGION_NAME", "AWS_SECURITY_TOKEN",
        "AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_DEFAULT_REGION",
        "AWS_ENDPOINT_URL", "AWS_ENDPOINT_URL_S3",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-role-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-role-secret")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "test-role-session-token")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.setenv("AWS_CONFIG_FILE", str(tmp_path / "config"))
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(tmp_path / "credentials"))
    monkeypatch.setattr(boto3, "DEFAULT_SESSION", None)


def signed_request():
    # Signing is local: no request is sent and no real credentials are read.
    with closing(storage._s3_client()) as client:
        url = client.generate_presigned_url(
            "get_object", Params={"Bucket": "test-media", "Key": "media/video.mp4"}
        )
    return parse_qs(urlsplit(url).query)


@pytest.mark.parametrize("temporary", [False, True])
def test_standard_aws_credentials_keep_their_session_token(monkeypatch, temporary):
    if not temporary:
        monkeypatch.delenv("AWS_SESSION_TOKEN")
    query = signed_request()
    assert query["X-Amz-Credential"][0].startswith("test-role-key/")
    assert query.get("X-Amz-Security-Token") == (
        ["test-role-session-token"] if temporary else None
    )


@pytest.mark.parametrize("source", ["environment", "config"])
def test_standard_s3_uses_the_sdk_region_configuration(monkeypatch, tmp_path, source):
    monkeypatch.delenv("AWS_REGION")
    if source == "environment":
        monkeypatch.setenv("AWS_DEFAULT_REGION", "us-west-2")
    else:
        (tmp_path / "config").write_text("[default]\nregion = us-west-2\n")
    assert "/us-west-2/s3/" in signed_request()["X-Amz-Credential"][0]


@pytest.mark.parametrize("prefix", ["R2", "AWS_S3"])
def test_storage_credentials_do_not_use_the_lambda_session_token(monkeypatch, prefix):
    monkeypatch.setenv(f"{prefix}_ACCESS_KEY_ID", "test-storage-key")
    monkeypatch.setenv(f"{prefix}_SECRET_ACCESS_KEY", "test-storage-secret")
    query = signed_request()
    assert query["X-Amz-Credential"][0].startswith("test-storage-key/")
    assert "X-Amz-Security-Token" not in query


def test_r2_pair_takes_precedence_over_s3_and_runtime_credentials(monkeypatch):
    for prefix in ("R2", "AWS_S3"):
        monkeypatch.setenv(f"{prefix}_ACCESS_KEY_ID", f"test-{prefix}-key")
        monkeypatch.setenv(f"{prefix}_SECRET_ACCESS_KEY", f"test-{prefix}-secret")
    assert signed_request()["X-Amz-Credential"][0].startswith("test-R2-key/")


@pytest.mark.parametrize("prefix", ["R2", "AWS_S3"])
@pytest.mark.parametrize("missing", ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"])
def test_incomplete_storage_credentials_do_not_mix_with_other_sources(monkeypatch, prefix, missing):
    for source in ("R2", "AWS_S3") if prefix == "R2" else ("AWS_S3",):
        monkeypatch.setenv(f"{source}_ACCESS_KEY_ID", "test-storage-key")
        monkeypatch.setenv(f"{source}_SECRET_ACCESS_KEY", "test-storage-secret")
    monkeypatch.delenv(f"{prefix}_{missing}")
    with pytest.raises(ValueError, match=prefix):
        signed_request()
