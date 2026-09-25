from worker_python.sqs_enqueue import build_job_message, child_job_id


def test_build_job_message_shape() -> None:
    msg = build_job_message(
        "transcribe_video",
        {"video_id": 42},
        job_id="job-1",
    )
    assert msg["type"] == "transcribe_video"
    assert msg["job_id"] == "job-1"
    assert msg["payload"] == {"video_id": 42}


def test_child_job_id_is_stable_and_stage_scoped() -> None:
    first = child_job_id("parent-1", "index_video_transcript", {"video_id": 42})
    again = child_job_id("parent-1", "index_video_transcript", {"video_id": 42})
    another_stage = child_job_id("parent-1", "build_plog", {"video_id": 42})

    assert first == again
    assert first != another_stage
