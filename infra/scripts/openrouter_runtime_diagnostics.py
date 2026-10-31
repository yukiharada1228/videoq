"""Read-only runtime diagnostics. Never print logs, credentials or user content."""
import json
import re
import time
from collections import Counter
from contextlib import closing

MARKERS = (
    "OpenRouter workload identity exchange rejected",
    "OpenRouter workload identity exchange failed",
    "OpenRouter federation requires a policy ID and AWS_REGION",
    "AccessDenied", "InvalidIdentityToken", "InvalidClientTokenId",
    "SignatureDoesNotMatch", "ExpiredToken", "Task timed out",
    "timestamp", "transcription", "embedding", "Traceback",
    "Whisper must return real segment timestamps", "verbose_json",
    "insufficient credits", "Insufficient credits", "not supported",
    "No endpoints found", "Invalid API key", "Invalid authentication",
    "Unauthorized", "Too Many Requests", "timed out",

)
SAFE_CONFIG = (
    "OPENAI_BASE_URL", "EMBEDDING_MODEL", "WHISPER_BACKEND",
    "OPENROUTER_FEDERATION_POLICY_ID", "OPENROUTER_FEDERATION_AUDIENCE",
    "LLM_MODEL", "VIDEO_VISUAL_ENABLED",
)


def summarize_logs(events):
    markers, exceptions, statuses = Counter(), Counter(), Counter()
    for event in events:
        message = event.get("message", "")
        for marker in MARKERS:
            if marker in message:
                markers[marker] += 1
        for name in re.findall(r"\b((?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Z][A-Za-z0-9_]*(?:Error|Exception)):", message):
            exceptions[name] += 1
        for code in re.findall(r"(?:Error code: |HTTP/[12](?:\.\d)?[ \"]+)([1-5][0-9]{2})\b", message):
            statuses[code] += 1
    return {"eventsExamined": len(events), "markers": dict(markers), "exceptionTypes": dict(exceptions), "httpStatuses": dict(statuses)}


def diagnose(session, region):
    from botocore.config import Config
    config = Config(connect_timeout=10, read_timeout=15, retries={"max_attempts": 0})
    result = {"status": "runtime_diagnostics", "readOnly": True}
    def inspect(label, service, fn):
        try:
            with closing(session.client(service, region_name=region, config=config)) as client:
                result[label] = fn(client)
        except Exception as error:
            result[label] = {"errorType": type(error).__name__}
    def function(client):
        value = client.get_function_configuration(FunctionName="videoq-worker-prod")
        env = value.get("Environment", {}).get("Variables", {})
        return {"state": value.get("State"), "lastUpdateStatus": value.get("LastUpdateStatus"),
                "config": {key: env[key] for key in SAFE_CONFIG if key in env}}
    def queue(client):
        url = client.get_queue_url(QueueName="videoq-worker-prod")["QueueUrl"]
        return client.get_queue_attributes(QueueUrl=url, AttributeNames=[
            "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible",
            "ApproximateNumberOfMessagesDelayed"])["Attributes"]
    def logs(client):
        events = []
        for page in client.get_paginator("filter_log_events").paginate(
                logGroupName="/aws/lambda/videoq-worker-prod", startTime=int((time.time()-3600)*1000),
                PaginationConfig={"MaxItems": 2000, "PageSize": 500}):
            events.extend(page.get("events", []))
        return summarize_logs(events)
    inspect("worker", "lambda", function)
    inspect("queue", "sqs", queue)
    inspect("logs", "logs", logs)
    return result


if __name__ == "__main__":
    import boto3
    session = boto3.Session()
    print(json.dumps(diagnose(session, session.region_name)))
