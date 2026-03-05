"""
Presentation-layer exporters for the chat domain.
Responsible for converting domain DTOs to output formats (CSV, etc.).
"""

import json


def write_chat_history_csv(writer, rows) -> None:
    """Write ChatHistoryExportRow DTOs to a csv.writer instance."""
    writer.writerow(
        ["created_at", "question", "answer", "is_shared_origin", "related_videos", "feedback"]
    )
    for row in rows:
        try:
            related_videos_str = json.dumps(row.related_videos, ensure_ascii=False)
        except Exception:
            related_videos_str = "[]"
        writer.writerow([
            row.created_at.isoformat(),
            row.question,
            row.answer,
            "true" if row.is_shared_origin else "false",
            related_videos_str,
            row.feedback or "",
        ])
