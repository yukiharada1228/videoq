"""
Presentation-layer exporters for the chat domain.
Responsible for converting domain DTOs to output formats (CSV, etc.).
"""

import json


def write_chat_history_csv(writer, rows) -> None:
    """Write ChatHistoryExportRow DTOs to a csv.writer instance."""
    writer.writerow(
        ["created_at", "question", "answer", "is_shared_origin", "citations", "feedback"]
    )
    for row in rows:
        try:
            citations = [
                {
                    "id": rv.id,
                    "video_id": rv.video_id,
                    "title": rv.title,
                    "start_time": rv.start_time,
                    "end_time": rv.end_time,
                }
                for rv in (row.citations or [])
            ]
            citations_str = json.dumps(citations, ensure_ascii=False)
        except Exception:
            citations_str = "[]"
        writer.writerow([
            row.created_at.isoformat(),
            row.question,
            row.answer,
            "true" if row.is_shared_origin else "false",
            citations_str,
            row.feedback or "",
        ])
