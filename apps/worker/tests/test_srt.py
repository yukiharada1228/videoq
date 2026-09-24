import pytest

from worker_python.pipeline.srt import (
    create_srt_from_whisper_segments,
    format_srt_time,
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


@pytest.mark.parametrize("newline", ["\n", "\r\n", "\r"])
@pytest.mark.parametrize("separator", ["", " \t"])
def test_parse_multiple_cues_with_different_newlines(newline, separator) -> None:
    srt = newline.join(
        [
            "1",
            "00:00:01,000 --> 00:00:02,000",
            "first line",
            "second line",
            separator,
            "2",
            "00:00:03,000 --> 00:00:04,000",
            "last cue",
        ]
    )

    scenes = parse_srt_scenes(srt)

    assert [
        (scene.index, scene.start_sec, scene.end_sec, scene.text) for scene in scenes
    ] == [
        (1, 1.0, 2.0, "first line\nsecond line"),
        (2, 3.0, 4.0, "last cue"),
    ]


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (-1.0, "00:00:00,000"),
        (1.2346, "00:00:01,235"),
        (59.9996, "00:01:00,000"),
        (3599.9996, "01:00:00,000"),
        (86399.9996, "24:00:00,000"),
    ],
)
def test_format_srt_time_carries_rounded_milliseconds(seconds, expected) -> None:
    assert format_srt_time(seconds) == expected
