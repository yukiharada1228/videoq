from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from worker_python import advisory_locks


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL is required for PostgreSQL integration tests",
)
def test_full_vector_lock_waits_for_an_active_video_writer(monkeypatch) -> None:
    lock_id = uuid.uuid4().int & ((1 << 63) - 1)
    monkeypatch.setattr(advisory_locks, "FULL_VECTOR_WRITE_LOCK_ID", lock_id)

    video_acquired = Event()
    release_video = Event()
    full_started = Event()
    full_acquired = Event()

    def hold_video_lock() -> None:
        with advisory_locks.video_vector_write_lock(42):
            video_acquired.set()
            assert release_video.wait(timeout=5)

    def acquire_full_lock() -> None:
        full_started.set()
        with advisory_locks.full_vector_write_lock():
            full_acquired.set()

    with ThreadPoolExecutor(max_workers=2) as executor:
        video_future = executor.submit(hold_video_lock)
        assert video_acquired.wait(timeout=5)
        full_future = executor.submit(acquire_full_lock)
        assert full_started.wait(timeout=5)
        assert not full_acquired.wait(timeout=0.2)

        release_video.set()
        assert full_acquired.wait(timeout=5)
        video_future.result(timeout=5)
        full_future.result(timeout=5)
