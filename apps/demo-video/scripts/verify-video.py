"""Reject corrupt demo exports before they replace the LP's video.

The wordmark/tag above the app stay still until the outro. Tiled Chrome
screenshots change this region and cause large isolated frame differences.
Decode every frame, inspect that invariant, and detect flashes in the full frame.
"""
import json
import statistics
import struct
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMELINE = json.loads((ROOT / 'content/timeline.json').read_text())
video = Path(sys.argv[1])
info = json.loads(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video),
]))
stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
fps = float(Fraction(stream['r_frame_rate']))

def frames(filters, width, height):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-xerror', '-i', str(video),
        '-vf', filters + ',format=gray', '-f', 'rawvideo', '-',
    ])
    size = width * height
    if len(raw) % size:
        raise SystemExit('Incomplete decoded frame')
    return [raw[i:i + size] for i in range(0, len(raw), size)]

def difference(left, right):
    return sum(abs(a - b) for a, b in zip(left, right)) / len(left)

decoded = frames('scale=160:90', 160, 90)
adjacent = [difference(a, b) for a, b in zip(decoded, decoded[1:])]
flashes = []
for i in range(1, len(decoded) - 1):
    incoming, outgoing = adjacent[i - 1:i + 1]
    if min(incoming, outgoing) > 6:
        surrounding = difference(decoded[i - 1], decoded[i + 1])
        if surrounding < min(incoming, outgoing) * .4:
            flashes.append(i)

header = frames('crop=1672:48:124:50,scale=334:10', 334, 10)
reference = header[round(fps)]
header_diffs = [difference(reference, f) for f in header[:round(TIMELINE['outro'] * fps)]]
corrupt_header = [i for i, value in enumerate(header_diffs) if value > 2.5]
outro_start = round(TIMELINE['outroEnd'] * fps)
outro_reference = decoded[round((TIMELINE['outroEnd'] + 1) * fps)]
corrupt_outro = [i for i in range(outro_start, len(decoded)) if difference(decoded[i], outro_reference) > 2.5]

boxes = []
with video.open('rb') as handle:
    while chunk := handle.read(8):
        size, kind = struct.unpack('>I4s', chunk)
        boxes.append(kind.decode('ascii'))
        if size < 8:
            break
        handle.seek(size - 8, 1)

checks = {
    'duration': abs(float(info['format']['duration']) - TIMELINE['duration']) < .1,
    'frame_count': len(decoded) == TIMELINE['duration'] * TIMELINE['fps'],
    'fps': fps == TIMELINE['fps'],
    'dimensions': (stream['width'], stream['height']) == (1920, 1080),
    'fast_start': boxes.index('moov') < boxes.index('mdat'),
    'size_limit': video.stat().st_size <= 16 * 1024 * 1024,
    'no_flashes': not flashes,
    'stable_header': not corrupt_header,
    'stable_outro': not corrupt_outro,
}
report = {
    'file': video.name, 'checks': checks, 'frames': len(decoded),
    'isolated_flash_frames': flashes, 'corrupt_header_frames': corrupt_header,
    'corrupt_outro_frames': corrupt_outro,
    'max_header_difference': round(max(header_diffs), 4),
    'mean_frame_difference': round(statistics.mean(adjacent), 4),
}
report_path = ROOT / 'review' / f'{video.stem}-quality.json'
report_path.parent.mkdir(exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
if not all(checks.values()):
    raise SystemExit('Video verification failed: ' + ', '.join(k for k, passed in checks.items() if not passed))
