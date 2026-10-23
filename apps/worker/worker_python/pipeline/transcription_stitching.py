"""Join overlapping decoding windows without discarding boundary speech."""
from __future__ import annotations

import unicodedata


def normalized(text: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold()
                   if not c.isspace() and unicodedata.category(c)[0] not in 'PZ')


def suffix_prefix(left: str, right: str) -> int:
    a, b = normalized(left), normalized(right)
    for size in range(min(len(a), len(b)), 0, -1):
        if a[-size:] == b[:size]:
            # Whole repeated cues are safe to merge even when very short.
            if size == len(a) == len(b) or size >= 4:
                return size
    return 0


def trim_normalized_prefix(text: str, size: int) -> str:
    for index in range(1, len(text) + 1):
        if len(normalized(text[:index])) >= size:
            return text[index:]
    return ''


def stitch_chunks(chunks: list[list[dict]], *, interval: float, duration: float) -> list[dict]:
    output: list[dict] = []
    for index, chunk in enumerate(chunks):
        boundary = index * interval
        for original in chunk:
            row = {**original, 'start': max(0.0, original['start']), 'end': min(duration, original['end'])}
            if row['start'] >= row['end'] or not row['text'].strip():
                continue
            merged = False
            # Compare only adjacent decoding windows and actual timestamp overlap.
            # Repeated words in non-overlapping utterances must remain separate.
            if index and row['start'] < boundary + 2:
                for previous in reversed(output[-8:]):
                    if previous['end'] < boundary - 2:
                        continue
                    if min(previous['end'], row['end']) <= max(previous['start'], row['start']):
                        continue
                    shared = suffix_prefix(previous['text'], row['text'])
                    if shared:
                        rest = trim_normalized_prefix(row['text'], shared)
                        if rest and previous['text'].endswith(rest[0]) and unicodedata.category(rest[0])[0] == 'P':
                            rest = rest[1:]
                        previous['text'] = previous['text'].rstrip() + rest
                        previous['end'] = max(previous['end'], row['end'])
                        merged = True
                        break
            if not merged:
                output.append(row)
    return sorted(output, key=lambda row: (row['start'], row['end']))
