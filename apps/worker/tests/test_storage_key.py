from worker_python.pipeline.storage import object_storage_key


def test_object_storage_key_prefixes_media() -> None:
    assert object_storage_key("videos/1/a.mp4") == "media/videos/1/a.mp4"


def test_object_storage_key_idempotent() -> None:
    assert object_storage_key("media/videos/1/a.mp4") == "media/videos/1/a.mp4"


def test_object_storage_key_strips_leading_slash() -> None:
    assert object_storage_key("/videos/1/a.mp4") == "media/videos/1/a.mp4"
