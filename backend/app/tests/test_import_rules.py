"""
CI test: detect forbidden cross-layer imports.

Acceptance criteria:
  - app/domain/**   : no app.models, django, rest_framework, celery, app.infrastructure
  - app/use_cases/**: no app.models, django, rest_framework, app.infrastructure
  - app/presentation/**: no app.models, no app.infrastructure.*
  - app/dependencies/**: no app.models, django, rest_framework, app.infrastructure
  - app/composition_root/**: no app.models, django, rest_framework, app.presentation
  - app/entrypoints/**: no app.use_cases, app.composition_root, app.infrastructure
  - QuerySet must not appear in domain or use_cases source files
  - use_cases context isolation: video/chat/auth contexts must not import each other directly
    (app.use_cases.shared is the only permitted cross-context import)
"""

import ast
import os
import textwrap
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
APP_ROOT = BASE / "app"
APP_TESTS_ROOT = APP_ROOT / "tests"

# Service locator is prohibited in framework entrypoints.
# Keep this allowlist empty by default; if temporary exceptions are needed,
# add minimal file paths and a removal note per entry.
ALLOWED_SERVICE_LOCATOR_FILES = set()


def get_python_files(base_path):
    base_path = Path(base_path).resolve()
    for root, _, files in os.walk(base_path):
        root_path = Path(root).resolve()
        # Skip only app/tests subtree. Do not skip every path segment named "tests".
        if root_path == APP_TESTS_ROOT or APP_TESTS_ROOT in root_path.parents:
            continue
        for f in files:
            if f.endswith(".py"):
                yield str(root_path / f)


def is_test_file_path(file_path):
    path = Path(file_path).resolve()
    return "tests" in path.parts


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


def check_forbidden_string_literals(file_path, forbidden_substrings):
    with open(file_path) as f:
        source = f.read()
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise AssertionError(f"SyntaxError while parsing {file_path}: {e}") from e

    violations = []
    for node in ast.walk(tree):
        value = None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value
        elif hasattr(ast, "Str") and isinstance(node, ast.Str):
            value = node.s

        if value is None:
            continue

        for forbidden in forbidden_substrings:
            if forbidden in value:
                violations.append((node.lineno, value))
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
    def _iter_layer_source_files(self, layer_path):
        abs_path = APP_ROOT / layer_path
        for fp in get_python_files(abs_path):
            if is_test_file_path(fp):
                continue
            yield fp

    def _count_python_files(self, layer_path):
        return sum(1 for _ in self._iter_layer_source_files(layer_path))

    def _check(self, layer_path, forbidden):
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files(layer_path)):
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

    def test_layer_scan_counts_are_non_zero(self):
        counts = {
            "domain": self._count_python_files("domain"),
            "use_cases": self._count_python_files("use_cases"),
            "presentation": self._count_python_files("presentation"),
            "infrastructure": self._count_python_files("infrastructure"),
            "dependencies": self._count_python_files("dependencies"),
            "composition_root": self._count_python_files("composition_root"),
            "entrypoints": self._count_python_files("entrypoints"),
        }
        print("scan_counts", counts)
        for layer, count in counts.items():
            self.assertGreater(
                count,
                0,
                f"Expected app/{layer} scan count > 0 to prevent no-op import checks.",
            )

    def test_use_cases_has_no_forbidden_imports(self):
        """use_cases layer must not import from app.models, django, rest_framework, or app.infrastructure."""
        self._check("use_cases", ["app.models", "django", "rest_framework", "app.infrastructure"])

    def test_use_cases_has_no_common_imports(self):
        """use_cases layer must not import presentation HTTP/auth concerns."""
        self._check("use_cases", ["app.common", "app.presentation.common"])

    def test_use_cases_has_no_utils_imports(self):
        """use_cases layer must not import from app.utils (framework utilities belong outside core)."""
        self._check("use_cases", ["app.utils"])

    def test_presentation_has_no_infrastructure_imports(self):
        """presentation layer must not import from app.models or any app.infrastructure.*."""
        self._check(
            "presentation", ["app.models", "app.infrastructure"]
        )

    def test_presentation_has_no_common_imports(self):
        """presentation must import from app.presentation.common, not app.common."""
        self._check("presentation", ["app.common"])

    def test_dependencies_has_no_forbidden_imports(self):
        """dependencies layer must stay as DI provider wrappers only."""
        self._check(
            "dependencies",
            [
                "app.models",
                "django",
                "rest_framework",
                "app.infrastructure",
                "app.presentation",
                "app.use_cases",
                "app.entrypoints",
            ],
        )

    def test_composition_root_has_no_presentation_imports(self):
        """composition_root must not depend on presentation, models, or framework APIs."""
        self._check(
            "composition_root",
            ["app.presentation", "app.models", "django", "rest_framework"],
        )

    def test_entrypoints_has_no_inner_layer_imports(self):
        """entrypoints must call dependencies/contracts, not use_cases/composition_root/infrastructure."""
        self._check(
            "entrypoints",
            ["app.use_cases", "app.composition_root", "app.infrastructure"],
        )

    def _check_cross_context(self, context_path, forbidden_contexts):
        """Verify that a use_cases context does not import from other contexts directly."""
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files(f"use_cases/{context_path}")):
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

    def test_use_cases_media_no_cross_context_imports(self):
        """use_cases/media must not import from use_cases/video, use_cases/auth, or use_cases/chat."""
        self._check_cross_context(
            "media",
            ["app.use_cases.video", "app.use_cases.auth", "app.use_cases.chat"],
        )

    def test_infrastructure_has_no_drf_imports(self):
        """infrastructure layer must not import rest_framework (HTTP concerns belong in presentation)."""
        self._check("infrastructure", ["rest_framework"])

    def test_infrastructure_has_no_use_cases_imports(self):
        """infrastructure layer must not import app.use_cases (dependency direction violation)."""
        self._check("infrastructure", ["app.use_cases"])

    def test_infrastructure_has_no_utils_imports(self):
        """infrastructure must not depend on app.utils."""
        self._check("infrastructure", ["app.utils"])

    def test_infrastructure_has_no_entrypoints_imports(self):
        """infrastructure must not import from app.entrypoints (dependency direction violation).

        Shared identifiers (e.g. task names) must live in app.contracts so that
        both infrastructure and entrypoints can reference them without either
        layer depending on the other.
        """
        self._check("infrastructure", ["app.entrypoints"])

    def test_presentation_auth_has_no_video_exceptions_imports(self):
        """presentation/auth must not import from use_cases/video (cross-context dependency)."""
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files("presentation/auth")):
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

    def test_presentation_has_no_simplejwt_imports(self):
        """presentation layer must not import simplejwt directly (JWT logic belongs in infrastructure)."""
        self._check("presentation", ["rest_framework_simplejwt"])

    def test_presentation_auth_has_no_authenticate_imports(self):
        """presentation/auth must not import django.contrib.auth.authenticate."""
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files("presentation/auth")):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, ["django.contrib.auth.authenticate"])
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            "presentation/auth must not import django.contrib.auth.authenticate:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_presentation_auth_has_no_orm_objects_usage(self):
        """presentation/auth must not access ORM manager (.objects)."""
        violations = []
        for fp in sorted(self._iter_layer_source_files("presentation/auth")):
            with open(fp) as f:
                source = f.read()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr == "objects":
                    rel = os.path.relpath(fp, BASE)
                    violations.append(f"{rel}:{node.lineno}")
        self.assertEqual(
            [],
            violations,
            "presentation/auth must not reference ORM manager '.objects':\n"
            + "\n".join(f"  {v}" for v in violations),
        )

    def test_presentation_has_no_factories_imports(self):
        """presentation must resolve dependencies through app.dependencies, not factories directly."""
        self._check("presentation", ["app.factories"])

    def test_presentation_has_no_utils_imports(self):
        """presentation must not depend on app.utils."""
        self._check("presentation", ["app.utils"])

    def test_presentation_has_no_composition_root_imports(self):
        """presentation must resolve wiring through app.dependencies, not app.composition_root."""
        self._check("presentation", ["app.composition_root"])

    def test_no_queryset_in_domain_or_use_cases(self):
        """QuerySet must not appear in domain or use_cases source files."""
        for layer in ["domain", "use_cases"]:
            violations = []
            for fp in sorted(self._iter_layer_source_files(layer)):
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

    def test_infrastructure_external_has_no_presentation_tasks_imports(self):
        """infrastructure/external must not import app.presentation.tasks."""
        self._check("infrastructure/external", ["app.presentation.tasks"])

    def test_infrastructure_has_no_presentation_string_dependencies(self):
        """infrastructure must not contain string literals referencing app.presentation.*."""
        forbidden_substring = "app.presentation."
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files("infrastructure")):
            rel = os.path.relpath(fp, BASE)
            violations = check_forbidden_string_literals(fp, [forbidden_substring])
            if violations:
                all_violations[rel] = violations

        if all_violations:
            details = []
            for rel, violations in all_violations.items():
                for _, literal in violations:
                    details.append(
                        "Forbidden string dependency detected:\n"
                        f"{rel}\n"
                        f'-> "{literal}"'
                    )
            self.fail("\n".join(details))

    def _check_single_file(self, rel_path, forbidden):
        """Check a single file for forbidden imports."""
        abs_path = APP_ROOT / rel_path
        if not abs_path.exists():
            return
        v = check_forbidden_imports(str(abs_path), forbidden)
        self.assertEqual(
            [],
            v,
            f"Forbidden imports found in app/{rel_path}: {v}",
        )

    def test_factories_package_removed(self):
        """Legacy factories package should stay removed after dependency migration."""
        self.assertFalse((APP_ROOT / "factories").exists(), "app/factories must not exist")
        self.assertFalse((APP_ROOT / "factories.py").exists(), "app/factories.py must not exist")

    def _assert_no_get_container_calls(self, rel_paths):
        violations = []
        for rel_path in rel_paths:
            if rel_path in ALLOWED_SERVICE_LOCATOR_FILES:
                continue
            abs_path = APP_ROOT / rel_path
            if not abs_path.exists():
                continue
            with open(abs_path) as f:
                source = f.read()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Name) and node.id == "get_container":
                    violations.append(f"app/{rel_path}:{node.lineno}")
        self.assertEqual(
            [],
            violations,
            "Direct get_container usage is forbidden in presentation:\n"
            + "\n".join(f"  {v}" for v in violations),
        )

    def _rel_paths_for_layer(self, layer_path):
        paths = []
        for fp in sorted(self._iter_layer_source_files(layer_path)):
            rel = os.path.relpath(fp, APP_ROOT).replace(os.sep, "/")
            paths.append(rel)
        return paths

    def test_presentation_has_no_get_container_calls(self):
        self._assert_no_get_container_calls(self._rel_paths_for_layer("presentation"))

    def test_admin_has_no_presentation_tasks_imports(self):
        """admin must import task entrypoints from app.entrypoints.tasks only."""
        self._check_single_file("admin.py", ["app.presentation.tasks"])

    def test_presentation_tasks_has_no_task_implementations(self):
        """presentation/tasks must stay empty (entrypoints own all Celery task implementations)."""
        tasks_dir = APP_ROOT / "presentation" / "tasks"
        disallowed_files = []
        for fp in get_python_files(tasks_dir):
            rel = os.path.relpath(fp, APP_ROOT).replace(os.sep, "/")
            if rel == "presentation/tasks/__init__.py":
                continue
            disallowed_files.append(rel)
        self.assertEqual(
            [],
            disallowed_files,
            "No files other than app/presentation/tasks/__init__.py are allowed:\n"
            + "\n".join(f"  {v}" for v in disallowed_files),
        )
