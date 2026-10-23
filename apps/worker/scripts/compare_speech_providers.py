"""Paid, opt-in comparison on an explicitly supplied PUBLIC audio fixture suite.

Uses the production decoder, retry/fallback, interval offsets and seam joiner.
Never connects to the job DB, queues or object storage. Reports are private 0600
files; credentials and upstream error bodies are never included.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse
from difflib import SequenceMatcher
import json
import math
import os
from pathlib import Path
import sys
import time
import unicodedata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from worker_python.pipeline.transcription import transcribe_audio_interval
from worker_python.pipeline.transcription_stitching import stitch_chunks, normalized
from worker_python.pipeline.speech_metrics import capture_speech_metrics
from whisper_runtime_validation import assess_response


def distance(left, right):
    previous = list(range(len(right) + 1))
    for i, item in enumerate(left, 1):
        row = [i]
        for j, other in enumerate(right, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j - 1] + (item != other)))
        previous = row
    return previous[-1]


def evaluate(case, segments):
    reference = normalized(case['reference'])
    hypothesis = normalized(''.join(s['text'] for s in segments))
    # Whitespace WER is included for space-delimited references only. Japanese
    # requires a specified morphological tokenizer; CER is the primary metric.
    words = unicodedata.normalize('NFKC', case['reference']).casefold().split()
    hypothesis_words = unicodedata.normalize('NFKC', ' '.join(s['text'] for s in segments)).casefold().split()
    matches = SequenceMatcher(None, reference, hypothesis, autojunk=False).get_matching_blocks()
    regions = []
    for region in case.get('regions', []):
        text = normalized(region['reference'] if 'reference' in region else region.get('text', ''))
        hits = [s for s in segments if text and text in normalized(s['text'])]
        regions.append({'start': region.get('start'), 'end': region.get('end'), 'matched': bool(hits),
            'start_error_seconds': min(abs(s['start'] - region['start']) for s in hits) if hits and 'start' in region else None,
            'end_error_seconds': min(abs(s['end'] - region['end']) for s in hits) if hits and 'end' in region else None})
    return {'cer': distance(reference, hypothesis) / len(reference) if reference else None,
        'whitespace_wer': distance(words, hypothesis_words) / len(words) if len(words) > 1 and not any('\u3040' <= ch <= '\u30ff' or '\u3400' <= ch <= '\u9fff' for ch in case['reference']) else None,
        'unexpected_characters_on_empty_reference': len(hypothesis) if not reference else None,
        'matched_reference_fraction': sum(m.size for m in matches) / len(reference) if reference else None,
        'timestamp_regions': regions,
        'source_coverage': assess_response({'segments': segments}, case),
        'invalid_timestamps': sum(not (0 <= s['start'] < s['end'] <= case['duration'] + .05) for s in segments)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--vars', type=Path)
    parser.add_argument('--providers', default='groq,openai')
    parser.add_argument('--concurrency', default='1,4')
    parser.add_argument('--limit', type=int, default=12)
    parser.add_argument('--interval', type=int, default=300)
    args = parser.parse_args()
    if args.vars:
        for line in args.vars.read_text().splitlines():
            key, separator, value = line.partition('=')
            if separator and key in {'GROQ_API_KEY', 'OPENAI_API_KEY'}:
                os.environ[key] = value.strip().strip('\"\'')
    providers = args.providers.split(',')
    concurrency = [int(n) for n in args.concurrency.split(',')]
    if any(p not in {'groq', 'openai', 'local'} for p in providers) or not 1 <= args.interval <= 300 or any(n < 1 or n > 8 for n in concurrency):
        parser.error('Invalid provider, interval or concurrency')
    suite = json.loads(args.suite.read_text())
    cases = suite['cases'][:args.limit]
    results = []
    fd = os.open(args.report, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    def write():
        output = json.dumps({'source': suite.get('source'), 'source_url': suite.get('source_url'),
            'captured_at': time.time(), 'interval': args.interval,
            'limitations': 'CER normalized NFKC without punctuation/space. Japanese WER unavailable without a tokenizer. Region timings are fixture cue spans, not word-level ground truth. Failed-attempt cost unknown, not zero. No improvement claim from this small suite.',
            'results': results}, ensure_ascii=False, indent=2).encode()
        os.lseek(fd, 0, os.SEEK_SET); os.write(fd, output); os.ftruncate(fd, len(output))
    def run(case):
        started = time.monotonic(); chunks = []; error = None
        with capture_speech_metrics() as calls:
            try:
                for start in range(0, math.ceil(case['duration']), args.interval):
                    chunks.append(transcribe_audio_interval((args.suite.parent / case['file']).resolve(), start, min(args.interval, case['duration'] - start)))
                segments = stitch_chunks(chunks, interval=args.interval, duration=case['duration'])
            except Exception as exc:
                segments = []; error = type(exc).__name__
        elapsed = time.monotonic() - started
        costs = [c.get('estimated_cost_usd') for c in calls]
        cost = sum(costs) if costs and all(c is not None for c in costs) else None
        return {'case': case['name'], 'duration': case['duration'], 'wall_seconds': elapsed,
            'seconds_per_audio_minute': elapsed / case['duration'] * 60, 'error': error,
            'estimated_cost_usd': cost, 'estimated_cost_per_audio_hour': cost / case['duration'] * 3600 if cost is not None else None,
            'actual_providers': sorted({c['provider'] for c in calls}), 'calls': calls,
            'quality': evaluate(case, segments), 'segments': segments}
    try:
        for provider in providers:
            os.environ['TRANSCRIPTION_PROVIDER'] = provider
            os.environ.pop('TRANSCRIPTION_MODEL', None)
            for workers in concurrency:
                started = time.monotonic()
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    rows = list(pool.map(run, cases))
                results.append({'requested_provider': provider, 'concurrency': workers,
                    'wall_seconds': time.monotonic() - started, 'audio_seconds': sum(c['duration'] for c in cases), 'cases': rows})
                write()
                print(json.dumps({'provider': provider, 'concurrency': workers, 'completed': len(rows), 'errors': sum(r['error'] is not None for r in rows)}))
    finally:
        os.close(fd)


if __name__ == '__main__':
    main()
