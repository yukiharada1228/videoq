from worker_python.sqs_enqueue import build_job_message


def test_build_job_message_shape() -> None:
    msg = build_job_message(
        "transcribe_video",
        {"video_id": 42},
        job_id="job-1",
    )
    assert msg["type"] == "transcribe_video"
    assert msg["job_id"] == "job-1"
    assert msg["payload"] == {"video_id": 42}
