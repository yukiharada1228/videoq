import json
import shutil
import struct
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from worker_python.pipeline import visual_chunks as chunks
from worker_python.pipeline.media_process import media_failure


def unpack(path):
    value = path.read_bytes()
    length = struct.unpack('<I', value[8:12])[0]
    return json.loads(value[12:12 + length]), value


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg required')
def test_real_chunks_keep_global_pts_offsets_tail_and_valid_image_ranges(tmp_path):
    source = tmp_path / 'delayed.mp4'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                    'testsrc2=size=160x90:rate=10:duration=123.4', '-f', 'lavfi', '-i',
                    'sine=duration=125.4', '-vf', 'setpts=PTS+2/TB', '-fps_mode', 'vfr',
                    '-c:v', 'mpeg4', '-c:a', 'aac', str(source)], check=True)
    times = []
    for index, expected in [(0, list(range(2, 60))), (1, list(range(60, 120))), (2, list(range(120, 126)))]:
        with chunks.build_visual_chunk(source, 42, 125.4, index) as (pack, sparse, count):
            manifest, raw = unpack(pack)
            actual = [row[0] / 1000 for row in manifest['frames']]
            assert actual == expected
            assert count == len(expected)
            times.extend(actual)
            for frame in json.loads(sparse):
                image = raw[frame['offset']:frame['offset'] + frame['length']]
                assert image.startswith(b'\xff\xd8\xff') and image.endswith(b'\xff\xd9')
    assert times == list(range(2, 126))


def test_seeks_at_input_and_stops_output_without_filtering_away_the_stop_frame(monkeypatch, tmp_path):
    def run(command, **kwargs):
        assert command.index('-ss') < command.index('-i')
        assert command[command.index('-ss') + 1] == '5400'
        assert command[command.index('-to') + 1] == '5460.000000'
        # Filtering out frames after the end would prevent FFmpeg reaching -to
        # and make it decode the rest of a multi-hour source unnecessarily.
        assert 'lt(t,' not in command[command.index('-vf') + 1]
        assert kwargs['timeout_seconds'] == 300
        return SimpleNamespace(returncode=-9, stderr='')
    monkeypatch.setattr(chunks, 'run_media_process', run)
    with pytest.raises(RuntimeError, match='SIGKILL'):
        with chunks.build_visual_chunk(tmp_path / 'video', 42, 9289.617, 90):
            pass


def test_signal_diagnostic_redacts_private_media_url():
    assert media_failure('Extraction', SimpleNamespace(returncode=-9, stderr='https://example.test/file?secret=value')) == 'Extraction failed (signal SIGKILL): [media URL]'


@pytest.mark.parametrize('duration,index', [(0, 0), (36001, 0), (float('nan'), 0), (10, 1), (10, -1), (10, True)])
def test_invalid_ranges_do_not_spawn_a_decoder(tmp_path, duration, index):
    with pytest.raises(ValueError):
        with chunks.build_visual_chunk(tmp_path / 'missing', 42, duration, index):
            pass
