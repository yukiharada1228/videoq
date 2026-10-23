"""Explicit, local-fixture acceptance for OpenAI-compatible speech servers.

This module is also copied into an ephemeral GPU validation container. It never
loads application credentials, downloads models or writes to the database.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import statistics
import time
import unicodedata


def normalized_text(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value).casefold()
                   if not c.isspace() and unicodedata.category(c)[0] not in "PZ")


def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


def assess_response(payload: dict, case: dict) -> dict:
    rows = payload.get("segments") or []
    errors = []
    if case.get("reference") and not rows:
        errors.append("speech_has_no_timestamped_segments")
    previous = -1.0
    for row in rows:
        start, end = row.get("start"), row.get("end")
        if (isinstance(start, bool) or isinstance(end, bool)
                or not isinstance(start, (float, int)) or not isinstance(end, (float, int))
                or not math.isfinite(start) or not math.isfinite(end)):
            errors.append("invalid_timestamp")
            continue
        if start < 0 or start >= end or end > case["duration"] + 1:
            errors.append("timestamp_outside_source")
        if start < previous:
            errors.append("timestamps_out_of_order")
        previous = start
    actual = normalized_text(" ".join(str(row.get("text", "")) for row in rows))
    reference = normalized_text(case.get("reference", ""))
    distance = edit_distance(reference, actual)
    regions = []
    for region in case.get("regions", []):
        text = normalized_text(" ".join(str(row.get("text", "")) for row in rows
                              if isinstance(row.get("start"), (float, int))
                              and isinstance(row.get("end"), (float, int))
                              and row["start"] < region["end"] and row["end"] > region["start"]))
        expected = normalized_text(region.get("reference", ""))
        regions.append({"start": region["start"], "end": region["end"],
                        "has_caption": bool(text),
                        "reference_characters": len(expected),
                        "cer": edit_distance(expected, text) / len(expected) if expected else None})
    return {"errors": sorted(set(errors)), "reference_characters": len(reference),
            "character_edits": distance, "cer": distance / len(reference) if reference else None,
            "segment_count": len(rows), "speech_regions": regions,
            "silence_hallucinated_characters": len(actual or normalized_text(str(payload.get("text", ""))))
            if not reference else None}


def request_case(base_url: str, case: dict, extra_body: dict | None = None) -> dict:
    import httpx
    from openai import OpenAI

    started = time.perf_counter()
    with OpenAI(base_url=base_url, api_key="local-validation", timeout=120,
                max_retries=0, http_client=httpx.Client(trust_env=False)) as client:
        result = client.audio.transcriptions.create(
            model="whisper-local", file=("audio.mp3", case["audio"]), language="ja",
            response_format="verbose_json", timestamp_granularities=["segment"],
            **({"extra_body": extra_body} if extra_body else {}),
        )
    payload = result.model_dump()
    return {"name": case["name"], "elapsed_seconds": time.perf_counter() - started,
            "source_seconds": case["duration"], "assessment": assess_response(payload, case),
            "response": payload}


def safe_request_case(base_url: str, case: dict, extra_body: dict | None = None) -> dict:
    started = time.perf_counter()
    try:
        return request_case(base_url, case, extra_body)
    except Exception as error:
        return {"name": case["name"], "source_seconds": case["duration"],
                "elapsed_seconds": time.perf_counter() - started,
                "error": type(error).__name__, "detail": str(error)[:300]}


def run_suite(base_url: str, cases: list[dict], *, extra_body: dict | None = None,
              long_case: dict | None = None) -> dict:
    # A completed, untimed warmup separates model/startup costs from warm inference.
    warmup = safe_request_case(base_url, cases[0], extra_body)
    if "error" in warmup:
        return {"warmup_error": warmup, "protocol_coverage_failures": ["warmup_request_failed"]}
    rows = [safe_request_case(base_url, case, extra_body) for case in cases]
    repeats = [safe_request_case(base_url, cases[0], extra_body) for _ in range(3)]
    concurrent_cases = cases[:min(4, len(cases))]
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        concurrent = list(pool.map(lambda c: safe_request_case(base_url, c, extra_body), concurrent_cases))
    elapsed = time.perf_counter() - started
    result = {
        "warmup_seconds": warmup["elapsed_seconds"], "cases": rows,
        "single_clip_median_seconds": statistics.median(row["elapsed_seconds"] for row in repeats if "error" not in row)
        if any("error" not in row for row in repeats) else None,
        "repeat_seconds": [row["elapsed_seconds"] for row in repeats],
        "concurrent": {"requests": len(concurrent), "elapsed_seconds": elapsed,
                       "audio_seconds_per_wall_second": sum(row["source_seconds"] for row in concurrent if "error" not in row) / elapsed,
                       "results": concurrent},
    }
    if long_case is not None:
        result["production_worker"] = run_worker_intervals(base_url, long_case)
    result["protocol_coverage_failures"] = protocol_coverage_failures(result, cases, long_case)
    return result


def protocol_coverage_failures(result: dict, cases: list[dict], long_case: dict | None) -> list[str]:
    """Protocol/source-coverage gate, not a production recognition-quality SLA."""
    if result.get("warmup_error"):
        return ["warmup_request_failed"]
    failures = []
    observed = {row["name"]: row for row in result.get("cases", [])}
    for case in cases:
        row = observed.get(case["name"], {})
        if "response" not in row:
            failures.append(f"{case['name']}:request_failed_or_missing")
            continue
        assessed = assess_response(row["response"], case)
        failures.extend(f"{case['name']}:{error}" for error in assessed["errors"])
        if assessed["silence_hallucinated_characters"]:
            failures.append(f"{case['name']}:silence_hallucination")
    if any("error" in row for row in result.get("concurrent", {}).get("results", [])):
        failures.append("concurrent_request_failed")
    if long_case:
        worker = result.get("production_worker", {})
        intervals = worker.get("intervals", [])
        cursor = 0.0
        for interval in intervals:
            if (not math.isclose(interval.get("offset", -1), cursor)
                    or not 0 < interval.get("duration", 0) <= 300):
                failures.append("worker_interval_plan_invalid")
            cursor += interval.get("duration", 0)
        if (not intervals or any("error" in row for row in intervals)
                or not math.isclose(sum(row["duration"] for row in intervals), long_case["duration"])):
            failures.append("long_worker_intervals_failed_or_missing")
        assessed = assess_response({"segments": worker.get("segments", [])}, long_case)
        failures.extend(f"long:{error}" for error in assessed["errors"])
        if any(not row["has_caption"] for row in assessed["speech_regions"]):
            failures.append("long_uncovered_speech_region")
        if any(row["cer"] is not None and row["cer"] >= .5 for row in assessed["speech_regions"]):
            failures.append("long_region_text_or_timing_mismatch")
    return sorted(set(failures))


def run_worker_intervals(base_url: str, case: dict) -> dict:
    import tempfile
    from worker_python.pipeline.transcription import transcribe_audio_interval
    from worker_python.pipeline.srt import create_srt_from_whisper_segments

    os.environ.update(WHISPER_BACKEND="local", WHISPER_LOCAL_URL=base_url,
                      OPENAI_API_KEY="local-validation")
    rows, intervals = [], []
    with tempfile.TemporaryDirectory(prefix="videoq-whisper-acceptance-") as directory:
        source = Path(directory) / "source.mp3"
        source.write_bytes(case["audio"])
        offset = 0.0
        while offset < case["duration"]:
            duration = min(300.0, case["duration"] - offset)
            started = time.perf_counter()
            try:
                segments = transcribe_audio_interval(source, offset, duration)
                assert all(offset <= row["start"] < row["end"] <= offset + duration for row in segments)
                rows.extend(segments)
                intervals.append({"offset": offset, "duration": duration,
                                  "elapsed_seconds": time.perf_counter() - started,
                                  "segments": len(segments)})
            except Exception as error:
                intervals.append({"offset": offset, "duration": duration,
                                  "error": type(error).__name__, "detail": str(error)[:300]})
            offset += duration
    return {"intervals": intervals, "assessment": assess_response({"segments": rows}, case),
            "segments": rows, "srt": create_srt_from_whisper_segments(rows)}


def load_cases(directory: Path) -> tuple[list[dict], dict | None]:
    manifest = json.loads((directory / "suite.json").read_text())
    cases = [{**case, "audio": (directory / case["file"]).read_bytes()}
             for case in manifest["cases"]]
    long_case = manifest.get("long_case")
    if long_case:
        long_case = {**long_case, "audio": (directory / long_case["file"]).read_bytes()}
    return cases, long_case


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--fixtures", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cases, long_case = load_cases(args.fixtures)
    args.output.write_text(json.dumps(run_suite(args.base_url, cases, long_case=long_case), ensure_ascii=False, indent=2))
    if json.loads(args.output.read_text())["protocol_coverage_failures"]:
        raise SystemExit("Protocol/source-coverage gate failed; inspect the saved result")
