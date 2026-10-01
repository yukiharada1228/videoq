"""VideoQ API と worker が共有する SQS job type contracts."""

JOB_TRANSCRIBE_VIDEO = "transcribe_video"
JOB_DELETE_ACCOUNT_DATA = "delete_account_data"
JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS = "reindex_all_videos_embeddings"
JOB_INDEX_VIDEO_TRANSCRIPT = "index_video_transcript"
JOB_REINDEX_VIDEO_TRANSCRIPT = "reindex_video_transcript"

_PAYLOAD_FIELDS = {
    JOB_TRANSCRIBE_VIDEO: "video_id",
    JOB_INDEX_VIDEO_TRANSCRIPT: "video_id",
    JOB_REINDEX_VIDEO_TRANSCRIPT: "video_id",
    JOB_DELETE_ACCOUNT_DATA: "user_id",
    JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS: None,
}


def validate_job_payload(job_type: str, payload: dict) -> None:
    """Validate native task arguments without coercing one resource ID to another."""
    if job_type not in _PAYLOAD_FIELDS:
        raise ValueError(f"Unsupported job type: {job_type}")
    field = _PAYLOAD_FIELDS[job_type]
    expected = {field} if field else set()
    if not isinstance(payload, dict) or set(payload) != expected:
        raise TypeError(f"{job_type} payload must contain exactly {sorted(expected)}")
    if field is None:
        return
    value = payload[field]
    if field == "user_id":
        if not isinstance(value, str) or not value.strip():
            raise ValueError("user_id must be a non-empty string")
    elif type(value) is not int or not 0 < value <= 2**53 - 1:
        # Match the API's positive safe integer IDs. bool is an int subclass;
        # int(float/string/bool) would silently change the queued operation.
        raise ValueError(f"{field} must be a positive safe integer")
