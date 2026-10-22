"""The deployed HTTP parser must be the same patched version exercised by CI."""
import ast
from pathlib import Path
import tomllib


def test_modal_http_dependencies_match_the_tested_lockfile():
    root = Path(__file__).resolve().parents[1]
    tree = ast.parse((root / "modal_batched_whisper.py").read_text())
    requirements = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "uv_pip_install":
            for argument in node.args:
                assert isinstance(argument, ast.Constant) and isinstance(argument.value, str)
                name, separator, version = argument.value.partition("==")
                assert separator, "Modal image packages must be version-pinned"
                requirements[name] = version
    lock = tomllib.loads((root / "uv.lock").read_text())
    locked = {package["name"]: package["version"] for package in lock["package"]}
    for name in ["fastapi", "starlette", "python-multipart"]:
        assert requirements[name] == locked[name], f"Deploy the {name} version that CI actually tests"
