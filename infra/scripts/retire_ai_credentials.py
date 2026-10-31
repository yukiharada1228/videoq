"""Plan or retire exact reviewed direct OpenAI keys and their two hosted copies."""
import json
import os
import re
import sys
from contextlib import closing
from urllib.request import Request, build_opener
from audit_ai_credentials import PROJECT_ID, NoRedirect, api_json, error_summary

PARAMETER = "/videoq/prod/app"
WORKER_POLICY = "6a428b3f-aa7b-4912-a639-2028fd210457"
API_POLICY = "c333bd7c-880a-437c-9fc9-e5825716325e"


def key_ids(raw):
    values = json.loads(raw)
    if not isinstance(values, list) or not values or any(not isinstance(v, str) or not re.fullmatch(r"key_[A-Za-z0-9_-]+", v) for v in values) or len(set(values)) != len(values):
        raise ValueError("Expected a nonempty unique list of project key IDs")
    return values


def write_json(url, token, method):
    request = Request(url, headers={"Authorization": "Bearer " + token}, method=method)
    with build_opener(NoRedirect).open(request, timeout=20) as response:
        return json.load(response)


def verify_router(values, policy):
    if values.get("OPENROUTER_FEDERATION_POLICY_ID") != policy or values.get("OPENAI_BASE_URL", "").rstrip("/") != "https://openrouter.ai/api/v1" or any(values.get(k) for k in ("LLM_BASE_URL", "EMBEDDING_BASE_URL")):
        raise ValueError("Expected the verified production federation configuration")


def redaction_shape(masked):
    if not isinstance(masked, str):
        return {"present": False}
    parts = re.split(r"\.{3,}|…+|\*+", masked)
    return {"present": True, "maskCount": len(parts)-1,
            "prefixLength": len(parts[0]), "suffixLength": len(parts[-1])}


def credential_kind(value):
    if not isinstance(value, str) or not value.strip():
        return "empty"
    value = value.strip()
    if value.startswith("sk-or-"):
        return "openrouter"
    if value.startswith("sk-proj-"):
        return "openai_project"
    return "openai_legacy" if value.startswith("sk-") else "other"


def masked_match(masked, value):
    if not isinstance(masked, str) or not isinstance(value, str):
        return False
    parts = re.split(r"\.{3,}|…+", masked)
    if len(parts) != 2 or len(parts[0])+len(parts[1]) < 7 or len(parts[1]) < 4:
        return False
    return value.startswith(parts[0]) and value.endswith(parts[1])


def maintain(session, environ, operation="plan", selected=(), expected_version=None):
    if operation not in ("plan", "retire"):
        raise ValueError("Unknown operation")
    account = environ["CLOUDFLARE_ACCOUNT_ID"]
    if not re.fullmatch(r"[a-f0-9]{32}", account):
        raise ValueError("Invalid account ID")
    cf = f"https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/videoq-api"
    admin = environ["OPENAI_ADMIN_KEY"]
    project_url = f"https://api.openai.com/v1/organization/projects/{PROJECT_ID}"
    project = api_json(project_url, admin)
    if project.get("id") != PROJECT_ID or project.get("name") != "videoq-prod":
        raise ValueError("Unexpected project")
    keys = []
    after = ""
    for _ in range(20):
        data = api_json(project_url+"/api_keys?limit=100"+("&after="+after if after else ""), admin)
        for entry in data["data"]:
            key_ids(json.dumps([entry["id"]]))
            keys.append(entry)
        if not data.get("has_more"):
            break
        after = data["last_id"]
        key_ids(json.dumps([after]))
    else:
        raise ValueError("Too many project key pages")
    settings = api_json(cf+"/settings", environ["CLOUDFLARE_API_TOKEN"])
    if settings.get("success") is not True:
        raise ValueError("Unable to inspect API")
    bindings = settings["result"]["bindings"]
    plain = {b["name"]: b.get("text", "") for b in bindings if b.get("type") == "plain_text"}
    verify_router(plain, API_POLICY)
    with closing(session.client("lambda")) as client:
        config = client.get_function_configuration(FunctionName="videoq-worker-prod")
    if config.get("LastUpdateStatus") != "Successful":
        raise ValueError("Worker update has not completed")
    verify_router(config.get("Environment", {}).get("Variables", {}), WORKER_POLICY)
    if config["Environment"]["Variables"].get("WHISPER_BACKEND") != "openrouter":
        raise ValueError("Unexpected transcription backend")
    with closing(session.client("ssm")) as ssm:
        parameter = ssm.get_parameter(Name=PARAMETER, WithDecryption=True)["Parameter"]
        payload = json.loads(parameter["Value"])
        if not isinstance(payload, dict) or any(payload.get(k) for k in ("LLM_BASE_URL", "EMBEDDING_BASE_URL")):
            raise ValueError("Unexpected app parameter overrides")
        cf_copy = any(b.get("type") == "secret_text" and b.get("name") == "OPENAI_API_KEY" for b in bindings)
        matches = [k["id"] for k in keys if masked_match(k.get("redacted_value"), payload.get("OPENAI_API_KEY"))]
        result = {"status": "ai_credential_retirement", "operation": operation, "projectId": PROJECT_ID,
                  "ssmVersion": parameter["Version"], "workerCopyPresent": bool(payload.get("OPENAI_API_KEY")), "apiCopyPresent": cf_copy,
                  "workerMatchingKeyIds": matches,
                  "workerCredentialKind": credential_kind(payload.get("OPENAI_API_KEY")),
                  "workerWhitespacePresent": isinstance(payload.get("OPENAI_API_KEY"), str) and payload["OPENAI_API_KEY"] != payload["OPENAI_API_KEY"].strip(),
                  "projectKeys": [{"id": k["id"], "name": k.get("name", ""), "createdAt": k.get("created_at"), "lastUsedAt": k.get("last_used_at"), "redactionShape": redaction_shape(k.get("redacted_value"))} for k in keys]}
        if operation == "plan":
            return result
        key_ids(json.dumps(list(selected)))
        available = {k["id"] for k in keys}
        if not set(matches) <= set(selected):
            raise ValueError("Selected keys disagree with the reviewed project inventory")
        if payload.get("OPENAI_API_KEY") and len(matches) != 1:
            raise ValueError("Worker key cannot be uniquely matched to this project")
        if expected_version != parameter["Version"]:
            raise ValueError("App parameter changed since review")
        # Resolve metadata and recheck version before irreversible key revocation.
        metadata = ssm.describe_parameters(ParameterFilters=[{"Key": "Name", "Option": "Equals", "Values": [PARAMETER]}])["Parameters"]
        if len(metadata) != 1 or parameter.get("Type") != "SecureString":
            raise ValueError("Expected one SecureString parameter")
        if ssm.get_parameter(Name=PARAMETER, WithDecryption=False)["Parameter"]["Version"] != expected_version:
            raise ValueError("Concurrent parameter update")
        if payload.pop("OPENAI_API_KEY", None) is not None:
            arguments = {"Name": PARAMETER, "Value": json.dumps(payload), "Type": "SecureString", "Overwrite": True}
            if metadata[0].get("KeyId"):
                arguments["KeyId"] = metadata[0]["KeyId"]
            result["newSsmVersion"] = ssm.put_parameter(**arguments)["Version"]
        if cf_copy:
            response = write_json(cf+"/secrets/OPENAI_API_KEY", environ["CLOUDFLARE_API_TOKEN"], "DELETE")
            if response.get("success") is not True:
                raise ValueError("Worker secret removal not confirmed")
        # Re-read both stores before provider revocation. Interrupted operations can
        # be replanned with the new SSM version; already absent keys are idempotent.
        remaining = json.loads(ssm.get_parameter(Name=PARAMETER, WithDecryption=True)["Parameter"]["Value"])
        updated = api_json(cf+"/settings", environ["CLOUDFLARE_API_TOKEN"])
        if "OPENAI_API_KEY" in remaining or updated.get("success") is not True or any(b.get("name") == "OPENAI_API_KEY" for b in updated["result"]["bindings"]):
            raise ValueError("Runtime secret removal could not be verified")
        revoked = []
        for identifier in selected:
            if identifier not in available:
                continue
            response = write_json(project_url+"/api_keys/"+identifier, admin, "DELETE")
            if response.get("deleted") is not True or response.get("id") != identifier:
                raise ValueError("Key deletion not confirmed")
            revoked.append(identifier)
        final = api_json(project_url+"/api_keys?limit=100", admin)
        if final.get("has_more") or any(k["id"] in selected for k in final["data"]):
            raise ValueError("Final key retirement could not be verified")
        result.update(revokedKeyIds=revoked, alreadyAbsentKeyIds=sorted(set(selected)-available), runtimeCopiesRemoved=True)
        return result


if __name__ == "__main__":
    import boto3
    try:
        operation = os.environ.get("OPERATION", "plan")
        selected = key_ids(os.environ.get("KEY_IDS", "[]")) if operation == "retire" else ()
        version = int(os.environ["EXPECTED_SSM_VERSION"]) if operation == "retire" else None
        result = maintain(boto3.Session(), os.environ, operation, selected, version)
    except Exception as error:
        print(json.dumps({"status": "ai_retirement_failed", **error_summary(error)}))
        sys.exit(1)
    print(json.dumps(result))
