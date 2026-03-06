"""Smoke checks for presentation DI wiring in URL configuration."""

import ast
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text())


def _path_calls(tree: ast.Module) -> list[ast.Call]:
    calls = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name) and node.func.id == "path":
            calls.append(node)
    return calls


class PresentationDiWiringTests(unittest.TestCase):
    def test_class_view_injections_are_not_none(self):
        for rel in ("presentation/chat/urls.py", "presentation/video/urls.py"):
            tree = _parse(APP_ROOT / rel)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                if not isinstance(node.func, ast.Attribute):
                    continue
                if node.func.attr != "as_view":
                    continue
                for kw in node.keywords:
                    self.assertFalse(
                        isinstance(kw.value, ast.Constant) and kw.value.value is None,
                        f"{rel}:{node.lineno} has None injection for {kw.arg}",
                    )

    def test_function_view_injections_are_not_none_and_use_case_named(self):
        rel = "presentation/video/urls.py"
        tree = _parse(APP_ROOT / rel)
        for call in _path_calls(tree):
            if len(call.args) < 3 or not isinstance(call.args[2], ast.Dict):
                continue
            kwargs_dict = call.args[2]
            for key_node, value_node in zip(kwargs_dict.keys, kwargs_dict.values):
                if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
                    continue
                key_name = key_node.value
                self.assertIn(
                    "_use_case",
                    key_name,
                    f"{rel}:{call.lineno} uses non use_case injection key: {key_name}",
                )
                self.assertNotIn(
                    "factory",
                    key_name,
                    f"{rel}:{call.lineno} should not use factory key naming: {key_name}",
                )
                self.assertFalse(
                    isinstance(value_node, ast.Constant) and value_node.value is None,
                    f"{rel}:{call.lineno} has None injection for {key_name}",
                )


if __name__ == "__main__":
    unittest.main()

