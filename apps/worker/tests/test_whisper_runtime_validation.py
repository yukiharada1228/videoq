"""Keep the acceptance verifier from accepting text-only or invalid subtitles."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "whisper_runtime_validation",
    Path(__file__).parents[1] / "scripts" / "whisper_runtime_validation.py",
)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def test_character_error_normalization_and_distance():
    assert checks.normalized_text("ＡＩ、 日本語。") == "ai日本語"
    assert checks.edit_distance("日本語", "日本語") == 0
    assert checks.edit_distance("日本語", "日本") == 1
    assert checks.edit_distance("", "日本語") == 3


def test_text_without_real_timestamped_segments_cannot_pass():
    result = checks.assess_response({"text": "日本語"}, {"duration": 10, "reference": "日本語"})
    assert result["errors"] == ["speech_has_no_timestamped_segments"]
    assert result["cer"] == 1


def test_text_only_silence_hallucination_is_reported():
    result = checks.assess_response({"text": "架空の字幕"}, {"duration": 10, "reference": ""})
    assert result["silence_hallucinated_characters"] == 5


def test_missing_suite_results_cannot_pass():
    case = {"name": "speech", "duration": 10, "reference": "日本語"}
    failures = checks.protocol_coverage_failures({}, [case], {**case, "regions": []})
    assert "speech:request_failed_or_missing" in failures
    assert "long_worker_intervals_failed_or_missing" in failures


def test_duplicate_source_offsets_cannot_pass_as_complete_long_audio():
    row = {"start": 0, "end": 20, "text": "日本語"}
    result = {"cases": [], "production_worker": {
        "segments": [row], "intervals": [{"offset": 0, "duration": 10}, {"offset": 0, "duration": 10}],
    }}
    failures = checks.protocol_coverage_failures(result, [], {"duration": 20, "reference": "日本語", "regions": []})
    assert "worker_interval_plan_invalid" in failures


@pytest.mark.parametrize("start,end,error", [
    (float("nan"), 2, "invalid_timestamp"),
    (False, 2, "invalid_timestamp"),
    (4, 3, "timestamp_outside_source"),
    (1, 20, "timestamp_outside_source"),
])
def test_invalid_timestamps_are_reported(start, end, error):
    result = checks.assess_response({"segments": [{"start": start, "end": end, "text": "日本語"}]},
                                    {"duration": 10, "reference": "日本語"})
    assert error in result["errors"]


def test_missing_region_and_silence_hallucination_are_visible():
    rows = [{"start": 1, "end": 3, "text": "日本語"}]
    result = checks.assess_response({"segments": rows}, {
        "duration": 20, "reference": "日本語", "regions": [{"start": 10, "end": 15}],
    })
    assert result["speech_regions"][0]["has_caption"] is False
    result = checks.assess_response({"segments": rows}, {"duration": 20, "reference": ""})
    assert result["silence_hallucinated_characters"] == 3


def test_temporal_overlap_without_matching_words_is_not_quality_evidence():
    result = checks.assess_response({"segments": [{"start": 1, "end": 5, "text": "違う内容"}]}, {
        "duration": 10, "reference": "日本語", "regions": [{"start": 1, "end": 5, "reference": "日本語"}],
    })
    assert result["speech_regions"][0]["has_caption"] is True
    assert result["speech_regions"][0]["cer"] >= 1


vad_spec = importlib.util.spec_from_file_location(
    "whisper_vad_validation_gateway",
    Path(__file__).parents[1] / "scripts" / "whisper_vad_validation_gateway.py",
)
vad = importlib.util.module_from_spec(vad_spec)
vad_spec.loader.exec_module(vad)


def test_vad_spans_keep_silence_offsets_and_do_not_exceed_decoder_window():
    rate = vad.RATE
    spans = vad.merge_speech_spans([
        {"start": 2 * rate, "end": 10 * rate},
        {"start": int(10.5 * rate), "end": 25 * rate},
        {"start": 40 * rate, "end": 50 * rate},
    ])
    assert spans == [(2 * rate, 25 * rate), (40 * rate, 50 * rate)]
    assert vad.merge_speech_spans([]) == []


def test_vad_restores_each_original_offset_once_and_clamps_padding():
    parts = [(2 * vad.RATE, 10 * vad.RATE, {
        "segments": [{"start": 1, "end": 9, "text": "前半"}],
    }), (40 * vad.RATE, 50 * vad.RATE, {
        "segments": [{"start": 2, "end": 6, "text": "後半"}],
    })]
    assert vad.restore_segments(parts, 50) == [
        {"id": 0, "start": 3, "end": 10, "text": "前半"},
        {"id": 1, "start": 42, "end": 46, "text": "後半"},
    ]


def test_vad_frontend_rejects_text_without_timestamps():
    with pytest.raises(ValueError, match="real timestamps"):
        vad.restore_segments([(0, vad.RATE, {"text": "本文"})], 1)
