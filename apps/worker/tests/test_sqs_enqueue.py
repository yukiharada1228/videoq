import base64
import json

from worker_python.sqs_enqueue import build_celery_job_message


def test_build_celery_job_message_shape() -> None:
    msg = build_celery_job_message(
        "app.entrypoints.tasks.transcription.transcribe_video",
        [42],
        job_id="job-1",
    )
    assert msg["headers"]["task"].endswith("transcribe_video")
    assert msg["headers"]["id"] == "job-1"
    args, kwargs, embed = json.loads(base64.b64decode(msg["body"]).decode())
    assert args == [42]
    assert kwargs == {}
    assert embed == {}
