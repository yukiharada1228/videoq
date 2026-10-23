"""Request-local, content-free speech metrics, also used by the acceptance runner."""
from contextlib import contextmanager
from contextvars import ContextVar

_METRICS: ContextVar[list[dict] | None] = ContextVar('speech_metrics', default=None)


@contextmanager
def capture_speech_metrics():
    rows = []
    token = _METRICS.set(rows)
    try:
        yield rows
    finally:
        _METRICS.reset(token)


def record_speech_metric(row):
    target = _METRICS.get()
    if target is not None:
        target.append(row.copy())
