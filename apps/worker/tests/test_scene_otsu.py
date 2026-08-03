from unittest.mock import MagicMock

import numpy as np

from worker_python.pipeline.scene_otsu import (
    SceneSplitter,
    apply_scene_splitting,
    l2_normalize,
)
from worker_python.pipeline.scene_otsu.splitter import SceneSplitter as SplitterCls


def test_l2_normalize_unit_rows() -> None:
    mat = np.array([[3.0, 4.0], [0.0, 5.0]], dtype=np.float64)
    out = l2_normalize(mat)
    norms = np.linalg.norm(out, axis=1)
    assert np.allclose(norms, [1.0, 1.0])


def test_find_otsu_threshold_single() -> None:
    splitter = SplitterCls(embedder=MagicMock())
    assert splitter._find_otsu_threshold(np.array([[0.1, 0.2, 0.3]])) == 0


def test_find_otsu_threshold_two_clusters() -> None:
    splitter = SplitterCls(embedder=MagicMock())
    embeddings = np.array(
        [
            [1.0, 0.0],
            [0.9, 0.1],
            [0.8, 0.2],
            [0.0, 1.0],
            [0.1, 0.9],
        ]
    )
    result = splitter._find_otsu_threshold(embeddings)
    assert result in {3, 4}


def test_process_merges_under_token_budget() -> None:
    mock_embedder = MagicMock()
    mock_embedder.count_tokens.side_effect = lambda t: max(1, len(t.split()))
    mock_embedder.encoding.encode.side_effect = lambda t: list(range(len(t.split()) or 1))
    mock_embedder.encoding.decode.side_effect = lambda ids: "x" * len(ids)
    # Two similar cues → one scene when total tokens <= max_tokens
    mock_embedder.get_embeddings.return_value = np.array(
        [[1.0, 0.0], [0.99, 0.01]], dtype=np.float64
    )

    splitter = SceneSplitter(embedder=mock_embedder)
    srt = (
        "1\n00:00:00,000 --> 00:00:01,000\nhello world\n\n"
        "2\n00:00:01,000 --> 00:00:02,000\nhello there\n"
    )
    out = splitter.process(srt, max_tokens=512)
    # Both cues fit in one scene
    assert out.count("-->") == 1
    assert "hello world" in out and "hello there" in out


def test_process_splits_dissimilar_when_over_budget() -> None:
    mock_embedder = MagicMock()
    # Each cue is 300 tokens → together 600 > 512, must split
    mock_embedder.count_tokens.return_value = 300
    mock_embedder.encoding.encode.side_effect = lambda t: list(range(300))
    mock_embedder.encoding.decode.side_effect = lambda ids: "tok"
    mock_embedder.get_embeddings.return_value = np.array(
        [[1.0, 0.0], [0.0, 1.0]], dtype=np.float64
    )

    splitter = SceneSplitter(embedder=mock_embedder)
    srt = (
        "1\n00:00:00,000 --> 00:00:01,000\nalpha\n\n"
        "2\n00:00:01,000 --> 00:00:02,000\nbeta\n"
    )
    out = splitter.process(srt, max_tokens=512)
    assert out.count("-->") == 2


def test_apply_scene_splitting_degrades_on_failure(monkeypatch) -> None:
    def boom(*_a, **_k):
        raise RuntimeError("embed down")

    monkeypatch.setattr(
        "worker_python.pipeline.scene_otsu.SceneSplitter",
        lambda *a, **k: MagicMock(process=boom),
    )
    original = "1\n00:00:00,000 --> 00:00:01,000\nkeep me\n"
    out, count = apply_scene_splitting(original, original_segment_count=1)
    assert out == original
    assert count == 1
