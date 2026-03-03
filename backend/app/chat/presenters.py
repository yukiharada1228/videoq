"""Presenters for chat module.

Presenters handle the transformation of domain data into
output formats (e.g. CSV, JSON). They sit in the interface / adapter layer
and must not contain domain logic.
"""

import csv
import json
from typing import IO, Iterable


def write_chat_history_csv(*, dest: IO[str], chat_logs: Iterable) -> None:
    """Write chat log records to *dest* as CSV rows.

    Args:
        dest: A file-like object supporting .write() (e.g. HttpResponse).
        chat_logs: An iterable of chat log objects with attributes
            ``created_at``, ``question``, ``answer``, ``is_shared_origin``,
            ``related_videos``, and ``feedback``.
    """
    writer = csv.writer(dest)
    writer.writerow(
        [
            "created_at",
            "question",
            "answer",
            "is_shared_origin",
            "related_videos",
            "feedback",
        ]
    )
    for log in chat_logs:
        try:
            related_videos_str = json.dumps(log.related_videos, ensure_ascii=False)
        except Exception:
            related_videos_str = "[]"

        writer.writerow(
            [
                log.created_at.isoformat(),
                log.question,
                log.answer,
                "true" if log.is_shared_origin else "false",
                related_videos_str,
                log.feedback or "",
            ]
        )
