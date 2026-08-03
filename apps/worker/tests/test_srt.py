from worker_python.pipeline.srt import (
    create_srt_from_whisper_segments,
    parse_srt_scenes,
    parse_srt_timestamp,
)


def test_parse_srt_timestamp() -> None:
    assert parse_srt_timestamp("00:01:02,500") == 62.5


def test_roundtrip_whisper_segments() -> None:
    srt = create_srt_from_whisper_segments(
        [
            {"start": 0.0, "end": 1.5, "text": "こんにちは"},
            {"start": 1.5, "end": 3.0, "text": "世界"},
        ]
    )
    scenes = parse_srt_scenes(srt)
    assert len(scenes) == 2
    assert scenes[0].text == "こんにちは"
    assert scenes[1].start_sec == 1.5
