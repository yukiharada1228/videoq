"""DI graph consistency checks for dependencies/composition_root wiring."""

import ast
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
DEPS_ROOT = APP_ROOT / "dependencies"
CR_ROOT = APP_ROOT / "composition_root"

DEPENDENCY_TO_CONTEXT = {
    "video.py": "video.py",
    "auth.py": "auth.py",
    "chat.py": "chat.py",
    "media.py": "media.py",
    "common.py": "auth.py",
    "tasks.py": None,  # tasks delegates to multiple contexts
    "admin.py": "video.py",
}


def _parse_module(path: Path) -> ast.Module:
    return ast.parse(path.read_text())


def _function_defs(tree: ast.Module) -> dict[str, ast.FunctionDef]:
    return {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name.startswith("get_")
    }


def _composition_root_aliases(tree: ast.Module) -> dict[str, str]:
    aliases = {}
    for node in tree.body:
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.module != "app.composition_root":
            continue
        for alias in node.names:
            aliases[alias.asname or alias.name] = alias.name
    return aliases


def _delegated_target(function_node: ast.FunctionDef) -> tuple[str, str]:
    returns = [node for node in function_node.body if isinstance(node, ast.Return)]
    if len(returns) != 1:
        raise AssertionError(f"{function_node.name} must contain exactly one return.")
    returned = returns[0].value
    if not isinstance(returned, ast.Call):
        raise AssertionError(f"{function_node.name} must return a function call.")
    func = returned.func
    if not isinstance(func, ast.Attribute) or not isinstance(func.value, ast.Name):
        raise AssertionError(
            f"{function_node.name} must call <composition_root_alias>.<provider>()."
        )
    return func.value.id, func.attr


class DiGraphConsistencyTest(unittest.TestCase):
    def test_dependencies_delegate_to_existing_composition_root_providers(self):
        for dep_filename in sorted(DEPENDENCY_TO_CONTEXT.keys()):
            dep_path = DEPS_ROOT / dep_filename
            dep_tree = _parse_module(dep_path)
            dep_funcs = _function_defs(dep_tree)
            self.assertGreater(
                len(dep_funcs),
                0,
                f"Expected get_* providers in {dep_path}.",
            )

            aliases = _composition_root_aliases(dep_tree)
            self.assertGreater(
                len(aliases),
                0,
                f"Expected composition_root imports in {dep_path}.",
            )

            context_filename = DEPENDENCY_TO_CONTEXT[dep_filename]
            context_funcs = None
            if context_filename is not None:
                context_tree = _parse_module(CR_ROOT / context_filename)
                context_funcs = _function_defs(context_tree)

            for dep_func_name, dep_func_node in dep_funcs.items():
                alias_name, target_name = _delegated_target(dep_func_node)
                self.assertIn(
                    alias_name,
                    aliases,
                    f"{dep_filename}:{dep_func_node.lineno} uses unknown alias {alias_name}.",
                )
                self.assertEqual(
                    dep_func_name,
                    target_name,
                    f"{dep_filename}:{dep_func_node.lineno} must delegate 1:1 "
                    f"({dep_func_name} -> {target_name}).",
                )

                target_context = aliases[alias_name] + ".py"
                target_tree = _parse_module(CR_ROOT / target_context)
                target_funcs = _function_defs(target_tree)
                self.assertIn(
                    target_name,
                    target_funcs,
                    f"Missing provider {target_name} in composition_root/{target_context}.",
                )

                if context_funcs is not None:
                    self.assertIn(
                        target_name,
                        context_funcs,
                        f"{dep_filename} delegates outside expected context {context_filename}.",
                    )

    def test_composition_root_use_case_providers_are_wired_with_calls(self):
        for context_filename in ["auth.py", "chat.py", "video.py", "media.py"]:
            tree = _parse_module(CR_ROOT / context_filename)
            funcs = _function_defs(tree)
            for func_name, func_node in funcs.items():
                if not func_name.endswith("_use_case"):
                    continue
                returns = [node for node in func_node.body if isinstance(node, ast.Return)]
                if len(returns) != 1:
                    self.fail(
                        f"{context_filename}:{func_node.lineno} {func_name} "
                        "must contain exactly one return."
                    )
                returned = returns[0].value
                self.assertIsInstance(
                    returned,
                    ast.Call,
                    f"{context_filename}:{func_node.lineno} {func_name} "
                    "must return a call expression (DI wiring missing).",
                )


if __name__ == "__main__":
    unittest.main()
