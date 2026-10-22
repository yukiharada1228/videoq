"""Read exactly the image dependencies declared by the Modal application."""
import ast
from pathlib import Path

tree = ast.parse((Path(__file__).resolve().parents[2] / "apps/worker/modal_batched_whisper.py").read_text())
requirements = []
for call in ast.walk(tree):
    if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "uv_pip_install":
        for value in call.args:
            if not isinstance(value, ast.Constant) or not isinstance(value.value, str) or "==" not in value.value:
                raise ValueError("Modal packages must use exact version pins")
            requirements.append(value.value)
if not requirements:
    raise ValueError("Modal image dependencies were not found")
print("\n".join(requirements))
