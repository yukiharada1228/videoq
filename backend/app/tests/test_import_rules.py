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
import textwrap
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
    except SyntaxError as e:
        raise AssertionError(f"SyntaxError while parsing {file_path}: {e}") from e

    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                # Normalize: "from app import models" → "app.models"
                full_name = f"{module}.{alias.name}" if module else alias.name
                for pattern in forbidden_patterns:
                    if (
                        module == pattern
                        or module.startswith(pattern + ".")
                        or full_name == pattern
                        or full_name.startswith(pattern + ".")
                    ):
                        violations.append(
                            (node.lineno, f"from {module} import {alias.name}")
                        )
                        break
        elif isinstance(node, ast.Import):
            for alias in node.names:
                for pattern in forbidden_patterns:
                    if alias.name == pattern or alias.name.startswith(pattern + "."):
                        violations.append((node.lineno, f"import {alias.name}"))
                        break
    return violations


class CheckForbiddenImportsTest(unittest.TestCase):
    """Unit tests for check_forbidden_imports edge cases."""

    def _check_source(self, source, forbidden_patterns):
        """Parse source string and return violations."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write(textwrap.dedent(source))
            tmp_path = f.name
        try:
            return check_forbidden_imports(tmp_path, forbidden_patterns)
        finally:
            os.unlink(tmp_path)

    def test_syntax_error_raises(self):
        """SyntaxError in scanned file must raise AssertionError (not swallow it)."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("def broken(:\n    pass\n")
            tmp_path = f.name
        try:
            with self.assertRaises(AssertionError):
                check_forbidden_imports(tmp_path, ["app.models"])
        finally:
            os.unlink(tmp_path)

    def test_import_dotted_caught(self):
        """import app.models must be detected."""
        violations = self._check_source("import app.models\n", ["app.models"])
        self.assertTrue(violations, "Expected violation for 'import app.models'")

    def test_import_dotted_as_caught(self):
        """import app.models as m must be detected."""
        violations = self._check_source("import app.models as m\n", ["app.models"])
        self.assertTrue(violations, "Expected violation for 'import app.models as m'")

    def test_from_module_import_name_caught(self):
        """from app import models must be detected when app.models is forbidden."""
        violations = self._check_source("from app import models\n", ["app.models"])
        self.assertTrue(violations, "Expected violation for 'from app import models'")

    def test_from_module_import_name_as_caught(self):
        """from app import models as m must be detected."""
        violations = self._check_source("from app import models as m\n", ["app.models"])
        self.assertTrue(violations, "Expected violation for 'from app import models as m'")

    def test_from_submodule_import_caught(self):
        """from app.models import User must be detected."""
        violations = self._check_source("from app.models import User\n", ["app.models"])
        self.assertTrue(violations, "Expected violation for 'from app.models import User'")

    def test_allowed_import_not_caught(self):
        """from app.use_cases.shared import exceptions must NOT be flagged for app.models."""
        violations = self._check_source(
            "from app.use_cases.shared import exceptions\n", ["app.models"]
        )
        self.assertFalse(violations)


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

    def test_use_cases_has_no_common_imports(self):
        """use_cases layer must not import from app.common (HTTP/auth concerns belong in presentation)."""
        self._check("use_cases", ["app.common"])

    def test_use_cases_has_no_utils_imports(self):
        """use_cases layer must not import from app.utils (framework utilities belong outside core)."""
        self._check("use_cases", ["app.utils"])

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

    def test_infrastructure_has_no_drf_imports(self):
        """infrastructure layer must not import rest_framework (HTTP concerns belong in presentation)."""
        self._check("infrastructure", ["rest_framework"])

    def test_infrastructure_has_no_use_cases_imports(self):
        """infrastructure layer must not import app.use_cases (dependency direction violation)."""
        self._check("infrastructure", ["app.use_cases"])

    def test_presentation_auth_has_no_video_exceptions_imports(self):
        """presentation/auth must not import from use_cases/video (cross-context dependency)."""
        abs_path = os.path.join(BASE, "app", "presentation", "auth")
        all_violations = {}
        for fp in sorted(get_python_files(abs_path)):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, ["app.use_cases.video"])
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            "presentation/auth must not import from app.use_cases.video:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_presentation_auth_has_no_simplejwt_imports(self):
        """presentation/auth must not import simplejwt directly (JWT logic belongs in infrastructure)."""
        abs_path = os.path.join(BASE, "app", "presentation", "auth")
        all_violations = {}
        for fp in sorted(get_python_files(abs_path)):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, ["rest_framework_simplejwt"])
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            "presentation/auth must not import rest_framework_simplejwt:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_presentation_has_no_factories_imports(self):
        """presentation must resolve dependencies through get_container(), not factories directly."""
        self._check("presentation", ["app.factories"])

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

    def test_domain_has_no_utils_imports(self):
        """domain layer must not import from app.utils (domain must stay framework-free)."""
        self._check("domain", ["app.utils"])

    def test_infrastructure_external_has_no_tasks_imports(self):
        """infrastructure/external must not import app.tasks (tasks are above infrastructure)."""
        self._check("infrastructure/external", ["app.tasks"])

    def test_utils_has_no_infrastructure_imports(self):
        """utils must not import from app.infrastructure (utils are below infrastructure)."""
        self._check("utils", ["app.infrastructure"])

    def test_utils_has_no_presentation_imports(self):
        """utils must not import from app.presentation."""
        self._check("utils", ["app.presentation"])

    def _check_single_file(self, rel_path, forbidden):
        """Check a single file for forbidden imports."""
        abs_path = os.path.join(BASE, "app", rel_path)
        if not os.path.exists(abs_path):
            return
        v = check_forbidden_imports(abs_path, forbidden)
        self.assertEqual(
            [],
            v,
            f"Forbidden imports found in app/{rel_path}: {v}",
        )

    def test_factories_has_no_presentation_imports(self):
        """factories.py must not import from app.presentation (presentation depends on factories, not vice versa)."""
        self._check_single_file("factories.py", ["app.presentation"])

    def test_container_has_no_presentation_imports(self):
        """container.py must not import from app.presentation."""
        self._check_single_file("container.py", ["app.presentation"])
