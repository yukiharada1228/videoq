"""
CI test: detect forbidden cross-layer imports.

Acceptance criteria:
  - app/domain/**   : no app.models, django, rest_framework, celery, app.infrastructure
  - app/use_cases/**: no app.models, django, rest_framework, app.infrastructure
  - app/presentation/**: no app.models, no app.infrastructure.*
  - QuerySet must not appear in domain or use_cases source files
  - use_cases context isolation: video/chat/auth contexts must not import each other directly
    (app.use_cases.shared is the only permitted cross-context import)
"""

import ast
import os
import unittest

BASE = os.path.join(os.path.dirname(__file__), "..", "..")


def get_python_files(base_path):
    for root, _, files in os.walk(base_path):
        # Skip test directories — test files legitimately import from all layers
        if "tests" in root.split(os.sep):
            continue
        for f in files:
            if f.endswith(".py"):
                yield os.path.join(root, f)


def check_forbidden_imports(file_path, forbidden_patterns):
    with open(file_path) as f:
        source = f.read()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            names = [alias.name for alias in node.names]
            for pattern in forbidden_patterns:
                if module == pattern or module.startswith(pattern + "."):
                    violations.append(
                        (node.lineno, f"from {module} import {', '.join(names)}")
                    )
                    break
        elif isinstance(node, ast.Import):
            for alias in node.names:
                for pattern in forbidden_patterns:
                    if alias.name == pattern or alias.name.startswith(pattern + "."):
                        violations.append((node.lineno, f"import {alias.name}"))
                        break
    return violations


class ImportRulesTest(unittest.TestCase):
    def _check(self, layer_path, forbidden):
        abs_path = os.path.join(BASE, "app", layer_path)
        all_violations = {}
        for fp in sorted(get_python_files(abs_path)):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, forbidden)
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            f"Forbidden imports found in app/{layer_path}:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_domain_has_no_forbidden_imports(self):
        """domain layer must not import from app.models, django, rest_framework, celery, app.infrastructure."""
        self._check(
            "domain",
            ["app.models", "django", "rest_framework", "celery", "app.infrastructure"],
        )

    def test_use_cases_has_no_forbidden_imports(self):
        """use_cases layer must not import from app.models, django, rest_framework, or app.infrastructure."""
        self._check("use_cases", ["app.models", "django", "rest_framework", "app.infrastructure"])

    def test_presentation_has_no_infrastructure_imports(self):
        """presentation layer must not import from app.models or any app.infrastructure.*."""
        self._check(
            "presentation", ["app.models", "app.infrastructure"]
        )

    def _check_cross_context(self, context_path, forbidden_contexts):
        """Verify that a use_cases context does not import from other contexts directly."""
        abs_path = os.path.join(BASE, "app", "use_cases", context_path)
        all_violations = {}
        for fp in sorted(get_python_files(abs_path)):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, forbidden_contexts)
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            f"Cross-context use_cases imports found in use_cases/{context_path}:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_use_cases_chat_no_cross_context_imports(self):
        """use_cases/chat must not import from use_cases/video or use_cases/auth."""
        self._check_cross_context(
            "chat",
            ["app.use_cases.video", "app.use_cases.auth"],
        )

    def test_use_cases_auth_no_cross_context_imports(self):
        """use_cases/auth must not import from use_cases/video or use_cases/chat."""
        self._check_cross_context(
            "auth",
            ["app.use_cases.video", "app.use_cases.chat"],
        )

    def test_use_cases_video_no_cross_context_imports(self):
        """use_cases/video must not import from use_cases/chat or use_cases/auth."""
        self._check_cross_context(
            "video",
            ["app.use_cases.chat", "app.use_cases.auth"],
        )

    def test_tasks_has_no_direct_model_or_infrastructure_imports(self):
        """tasks/ must not import app.models or app.infrastructure directly.
        Tasks should only act as thin triggers delegating to use cases via factories."""
        self._check("tasks", ["app.models", "app.infrastructure"])

    def test_no_queryset_in_domain_or_use_cases(self):
        """QuerySet must not appear in domain or use_cases source files."""
        for layer in ["domain", "use_cases"]:
            abs_path = os.path.join(BASE, "app", layer)
            violations = []
            for fp in sorted(get_python_files(abs_path)):
                with open(fp) as f:
                    content = f.read()
                if "QuerySet" in content:
                    rel = os.path.relpath(fp, BASE)
                    violations.append(rel)
            self.assertEqual(
                [],
                violations,
                f"QuerySet found in app/{layer} files: {violations}",
            )
