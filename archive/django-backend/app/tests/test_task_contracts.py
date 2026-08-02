"""Task name contract checks between contracts and Celery registrations."""

import ast
import unittest
from pathlib import Path

from app.contracts.tasks import (
    DELETE_ACCOUNT_DATA_TASK,
    REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK,
    TRANSCRIBE_VIDEO_TASK,
)

APP_ROOT = Path(__file__).resolve().parents[1]


def _load_source(path: Path) -> ast.Module:
    return ast.parse(path.read_text())


def _imported_contract_symbols(tree: ast.Module) -> dict[str, str]:
    values = {
        "TRANSCRIBE_VIDEO_TASK": TRANSCRIBE_VIDEO_TASK,
        "DELETE_ACCOUNT_DATA_TASK": DELETE_ACCOUNT_DATA_TASK,
        "REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK": REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK,
    }
    symbols: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.contracts.tasks":
            for alias in node.names:
                local_name = alias.asname or alias.name
                if alias.name in values:
                    symbols[local_name] = values[alias.name]
    return symbols


def _shared_task_name(path: Path, function_name: str) -> str:
    tree = _load_source(path)
    symbols = _imported_contract_symbols(tree)

    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name != function_name:
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            if not isinstance(decorator.func, ast.Name) or decorator.func.id != "shared_task":
                continue
            for kw in decorator.keywords:
                if kw.arg != "name":
                    continue
                if isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    return kw.value.value
                if isinstance(kw.value, ast.Name) and kw.value.id in symbols:
                    return symbols[kw.value.id]
                raise AssertionError(
                    f"Unsupported task name expression in {path}: {ast.dump(kw.value)}"
                )
    raise AssertionError(f"@shared_task(name=...) not found for {path}:{function_name}")


class TaskContractsTest(unittest.TestCase):
    def test_transcribe_video_task_name_matches_contract(self):
        path = APP_ROOT / "entrypoints/tasks/transcription.py"
        self.assertEqual(TRANSCRIBE_VIDEO_TASK, _shared_task_name(path, "transcribe_video"))

    def test_delete_account_data_task_name_matches_contract(self):
        path = APP_ROOT / "entrypoints/tasks/account_deletion.py"
        self.assertEqual(
            DELETE_ACCOUNT_DATA_TASK, _shared_task_name(path, "delete_account_data")
        )

    def test_reindex_all_videos_embeddings_task_name_matches_contract(self):
        path = APP_ROOT / "entrypoints/tasks/reindexing.py"
        self.assertEqual(
            REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK,
            _shared_task_name(path, "reindex_all_videos_embeddings"),
        )


if __name__ == "__main__":
    unittest.main()
