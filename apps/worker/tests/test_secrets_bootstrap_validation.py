import json
import os
import sys
from unittest.mock import MagicMock

import boto3
import pytest

from worker_python import secrets_bootstrap as bootstrap


@pytest.fixture
def ssm(monkeypatch):
    monkeypatch.setattr(bootstrap, "_LOADED", False)
    for key in {
        *bootstrap._APP_ENV_MAP.values(), "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "DATABASE_URL", "DB_PARAM_NAME", "DB_SECRET_ARN", "APP_PARAM_NAME", "APP_SECRET_ARN",
        "AWS_STORAGE_BUCKET_NAME", "AWS_S3_ENDPOINT_URL", "AWS_S3_REGION_NAME",
    }:
        # Record absent keys too: bootstrap writes os.environ directly.
        monkeypatch.setenv(key, "")
    monkeypatch.setenv("APP_PARAM_NAME", "/test/app")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-role-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-role-secret")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "test-role-session")
    values = {"/test/app": "{}", "/test/db": '{"DATABASE_URL":"postgresql://test/db"}'}
    client = MagicMock()
    client.get_parameter.side_effect = lambda Name, WithDecryption: {
        "Parameter": {"Value": values[Name]},
    }
    monkeypatch.setattr(boto3, "client", MagicMock(return_value=client))
    return values, client


@pytest.mark.parametrize("source", ["environment", "canonical", "legacy"])
@pytest.mark.parametrize("missing", ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"])
def test_partial_pairs_never_borrow_from_a_lower_priority_source(ssm, monkeypatch, source, missing):
    values, client = ssm
    payload = {}
    if source != "legacy":
        payload.update(AWS_ACCESS_KEY_ID="test-old-key", AWS_SECRET_ACCESS_KEY="test-old-secret")
    prefix = "AWS" if source == "legacy" else "R2"
    pair = {f"{prefix}_ACCESS_KEY_ID": "test-selected-key", f"{prefix}_SECRET_ACCESS_KEY": "test-selected-secret"}
    payload.update(pair)
    if source == "environment":
        for key, value in pair.items():
            if key != f"{prefix}_{missing}":
                monkeypatch.setenv(key, value)
    else:
        del payload[f"{prefix}_{missing}"]
    values["/test/app"] = json.dumps(payload)
    original = {key: os.environ[key] for key in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")}

    with pytest.raises(ValueError, match=prefix):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False
    assert {key: os.environ[key] for key in original} == original
    client.close.assert_called_once()

    if source == "environment":
        monkeypatch.setenv(f"{prefix}_{missing}", pair[f"{prefix}_{missing}"])
    else:
        payload.update(pair)
        values["/test/app"] = json.dumps(payload)
    bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is True
    assert os.environ["R2_ACCESS_KEY_ID"] == "test-selected-key"
    assert os.environ["R2_SECRET_ACCESS_KEY"] == "test-selected-secret"


@pytest.mark.parametrize("value", [42, True, [], {}, "", "  ", None])
def test_non_string_credential_is_not_replaced_with_a_legacy_value(ssm, value):
    values, _ = ssm
    values["/test/app"] = json.dumps({
        "R2_ACCESS_KEY_ID": value, "R2_SECRET_ACCESS_KEY": "test-selected-secret",
        "AWS_ACCESS_KEY_ID": "test-old-key", "AWS_SECRET_ACCESS_KEY": "test-old-secret",
    })
    with pytest.raises(ValueError, match="R2"):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False
    assert os.environ["R2_ACCESS_KEY_ID"] == ""


@pytest.mark.parametrize("raw", ["", "  ", "[]", "null", "42", '"text"'])
def test_invalid_parameter_can_be_corrected_in_the_same_warm_container(ssm, raw):
    values, client = ssm
    values["/test/app"] = raw
    with pytest.raises(ValueError):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False
    client.close.assert_called_once()
    values["/test/app"] = '{"OPENAI_API_KEY":"test-corrected-key"}'
    bootstrap.ensure_secrets_loaded()
    assert os.environ["OPENAI_API_KEY"] == "test-corrected-key"
    assert client.get_parameter.call_count == 2
    assert bootstrap._LOADED is True


@pytest.mark.parametrize("payload", [{}, {"DATABASE_URL": ""}, {"DATABASE_URL": "  "}])
def test_missing_database_url_does_not_mark_bootstrap_complete(ssm, monkeypatch, payload):
    values, _ = ssm
    monkeypatch.setenv("DB_PARAM_NAME", "/test/db")
    values["/test/db"] = json.dumps(payload)
    with pytest.raises(ValueError, match="DATABASE_URL"):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False
    values["/test/db"] = '{"DATABASE_URL":"postgresql://test/corrected"}'
    bootstrap.ensure_secrets_loaded()
    assert os.environ["DATABASE_URL"] == "postgresql://test/corrected"


def test_failed_app_load_does_not_commit_a_partial_environment(ssm, monkeypatch):
    values, _ = ssm
    monkeypatch.setenv("DB_PARAM_NAME", "/test/db")
    values["/test/app"] = "{"
    with pytest.raises(ValueError):
        bootstrap.ensure_secrets_loaded()
    assert os.environ["DATABASE_URL"] == ""
    assert bootstrap._LOADED is False
    values["/test/db"] = '{"DATABASE_URL":"postgresql://test/corrected"}'
    values["/test/app"] = "{}"
    bootstrap.ensure_secrets_loaded()
    assert os.environ["DATABASE_URL"] == "postgresql://test/corrected"


def test_configured_ssm_requires_its_dependency(ssm, monkeypatch):
    monkeypatch.setitem(sys.modules, "boto3", None)
    with pytest.raises(ImportError):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False


@pytest.mark.parametrize("key", ["OPENAI_API_KEY", "R2_BUCKET_NAME"])
def test_non_string_app_settings_do_not_commit_other_secrets(ssm, key):
    values, _ = ssm
    values["/test/app"] = json.dumps({
        key: 42, "R2_ACCESS_KEY_ID": "test-r2-key", "R2_SECRET_ACCESS_KEY": "test-r2-secret",
    })
    with pytest.raises(ValueError, match=key):
        bootstrap.ensure_secrets_loaded()
    assert bootstrap._LOADED is False
    assert os.environ["R2_ACCESS_KEY_ID"] == ""


@pytest.mark.parametrize("key, parameter, value", [
    ("DATABASE_URL", "/test/db", "postgresql://test/corrected"),
    ("OPENAI_API_KEY", "/test/app", "test-corrected-key"),
])
def test_blank_environment_value_does_not_hide_ssm_configuration(ssm, monkeypatch, key, parameter, value):
    values, _ = ssm
    monkeypatch.setenv(key, "  ")
    monkeypatch.setenv("DB_PARAM_NAME", "/test/db")
    values[parameter] = json.dumps({key: value})
    bootstrap.ensure_secrets_loaded()
    assert os.environ[key] == value


@pytest.mark.parametrize("source", ["environment", "canonical", "legacy"])
def test_complete_pairs_follow_precedence_without_changing_role_credentials(ssm, monkeypatch, source):
    values, client = ssm
    payload = {"AWS_ACCESS_KEY_ID": "test-legacy-key", "AWS_SECRET_ACCESS_KEY": "test-legacy-secret"}
    if source != "legacy":
        payload.update(R2_ACCESS_KEY_ID="test-canonical-key", R2_SECRET_ACCESS_KEY="test-canonical-secret")
    if source == "environment":
        monkeypatch.setenv("R2_ACCESS_KEY_ID", "test-environment-key")
        monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "test-environment-secret")
    values["/test/app"] = json.dumps(payload)
    bootstrap.ensure_secrets_loaded()
    assert os.environ["R2_ACCESS_KEY_ID"] == f"test-{source}-key"
    assert os.environ["R2_SECRET_ACCESS_KEY"] == f"test-{source}-secret"
    assert os.environ["AWS_ACCESS_KEY_ID"] == "test-role-key"
    assert os.environ["AWS_SECRET_ACCESS_KEY"] == "test-role-secret"
    assert os.environ["AWS_SESSION_TOKEN"] == "test-role-session"
    bootstrap.ensure_secrets_loaded()
    client.get_parameter.assert_called_once_with(Name="/test/app", WithDecryption=True)
