"""
CI test: detect forbidden cross-layer imports.

Acceptance criteria:
  - app/domain/**   : no app.models, django, rest_framework, celery, app.infrastructure, app.use_cases
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
LAYER_ROOTS = {
    "domain",
    "use_cases",
    "presentation",
    "infrastructure",
    "dependencies",
    "composition_root",
    "entrypoints",
    "contracts",
    "tests",
    "migrations",
}

# Service locator is prohibited in framework entrypoints.
# Keep this allowlist empty by default; if temporary exceptions are needed,
# add minimal file paths and a removal note per entry.
ALLOWED_SERVICE_LOCATOR_FILES: set[str] = set()
ALLOWED_DYNAMIC_IMPORT_FILES: set[str] = set()


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


def _call_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _call_name(node.value)
        if parent:
            return f"{parent}.{node.attr}"
        return node.attr
    return None


def check_forbidden_call_expressions(file_path, forbidden_calls):
    with open(file_path) as f:
        source = f.read()
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise AssertionError(f"SyntaxError while parsing {file_path}: {e}") from e

    alias_map = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                key = alias.asname or alias.name.split(".")[0]
                alias_map[key] = alias.name
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                key = alias.asname or alias.name
                full = f"{module}.{alias.name}" if module else alias.name
                alias_map[key] = full

    violations = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        called = _call_name(node.func)
        if called and "." in called:
            head, tail = called.split(".", 1)
            if head in alias_map:
                called = f"{alias_map[head]}.{tail}"
        elif called in alias_map:
            called = alias_map[called]
        if called in forbidden_calls:
            violations.append((node.lineno, called))
    return violations


def _import_alias_map(tree):
    alias_map = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                key = alias.asname or alias.name.split(".")[0]
                alias_map[key] = alias.name
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                key = alias.asname or alias.name
                full = f"{module}.{alias.name}" if module else alias.name
                alias_map[key] = full
    return alias_map


def _iter_annotation_refs(annotation):
    if annotation is None:
        return

    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):
        try:
            parsed = ast.parse(annotation.value, mode="eval")
            yield from _iter_annotation_refs(parsed.body)
        except SyntaxError:
            return
        return

    for node in ast.walk(annotation):
        if isinstance(node, ast.Name):
            yield node.id
        elif isinstance(node, ast.Attribute):
            name = _call_name(node)
            if name:
                yield name


def _resolve_annotation_ref(ref, alias_map):
    if "." in ref:
        head, tail = ref.split(".", 1)
        if head in alias_map:
            return f"{alias_map[head]}.{tail}"
    return alias_map.get(ref, ref)


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

    def test_dynamic_import_call_caught(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("import importlib\nimportlib.import_module('app.foo')\n")
            tmp_path = f.name
        try:
            found = check_forbidden_call_expressions(
                tmp_path, {"importlib.import_module"}
            )
            self.assertTrue(found)
        finally:
            os.unlink(tmp_path)

    def test_dynamic_import_alias_call_caught(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("import importlib as il\nil.import_module('app.foo')\n")
            tmp_path = f.name
        try:
            found = check_forbidden_call_expressions(
                tmp_path, {"importlib.import_module"}
            )
            self.assertTrue(found)
        finally:
            os.unlink(tmp_path)

    def test_builtin_dunder_import_call_caught(self):
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
            f.write("__import__('app.foo')\n")
            tmp_path = f.name
        try:
            found = check_forbidden_call_expressions(tmp_path, {"__import__"})
            self.assertTrue(found)
        finally:
            os.unlink(tmp_path)


class ImportRulesTest(unittest.TestCase):
    def _iter_layer_source_files(self, layer_path):
        abs_path = APP_ROOT / layer_path
        for fp in get_python_files(abs_path):
            if is_test_file_path(fp):
                continue
            yield fp

    def _count_python_files(self, layer_path):
        return sum(1 for _ in self._iter_layer_source_files(layer_path))

    def _iter_layer_test_files(self, layer_path):
        abs_path = APP_ROOT / layer_path
        for fp in get_python_files(abs_path):
            if not is_test_file_path(fp):
                continue
            yield fp

    def _check_forbidden_calls_in_files(self, file_paths, forbidden_calls):
        all_violations = {}
        for fp in sorted(file_paths):
            rel = os.path.relpath(fp, BASE)
            if rel.replace(os.sep, "/") in ALLOWED_DYNAMIC_IMPORT_FILES:
                continue
            v = check_forbidden_call_expressions(fp, forbidden_calls)
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            "Forbidden dynamic import calls found:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

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
        """domain layer must not import from app.models, django, rest_framework, celery, app.infrastructure, or app.use_cases."""
        self._check(
            "domain",
            [
                "app.models",
                "django",
                "rest_framework",
                "celery",
                "app.infrastructure",
                "app.use_cases",
            ],
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
        for layer, count in counts.items():
            self.assertGreater(
                count,
                0,
                f"Expected app/{layer} scan count > 0 to prevent no-op import checks.",
            )

    def test_use_cases_has_no_forbidden_imports(self):
        """use_cases layer must not import from app.models, django, rest_framework, or app.infrastructure."""
        self._check("use_cases", ["app.models", "django", "rest_framework", "app.infrastructure"])

    def test_core_layers_have_no_dynamic_import_calls(self):
        """Dynamic imports are disallowed in app layers guarded by import rules."""
        forbidden_calls = {"importlib.import_module", "__import__"}
        file_paths = []
        for layer in [
            "domain",
            "use_cases",
            "presentation",
            "dependencies",
            "composition_root",
            "entrypoints",
            "infrastructure",
        ]:
            file_paths.extend(self._iter_layer_source_files(layer))
        self._check_forbidden_calls_in_files(file_paths, forbidden_calls)

    def test_presentation_tests_have_lightweight_boundary_rules(self):
        """presentation tests should avoid direct wiring to inner implementation layers."""
        all_violations = {}
        for fp in sorted(self._iter_layer_test_files("presentation")):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(
                fp,
                ["app.composition_root", "app.infrastructure", "app.entrypoints"],
            )
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            "Forbidden imports found in app/presentation/**/tests:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

    def test_presentation_and_use_cases_tests_have_no_dynamic_import_calls(self):
        """Major test layers should avoid dynamic import indirection."""
        forbidden_calls = {"importlib.import_module", "__import__"}
        file_paths = list(self._iter_layer_test_files("presentation"))
        file_paths.extend(self._iter_layer_test_files("use_cases"))
        self._check_forbidden_calls_in_files(file_paths, forbidden_calls)

    def test_use_cases_has_no_common_imports(self):
        """use_cases layer must not import presentation HTTP/auth concerns."""
        self._check("use_cases", ["app.common", "app.presentation.common"])

    def test_use_cases_has_no_utils_imports(self):
        """use_cases layer must not import from app.utils (framework utilities belong outside core)."""
        self._check("use_cases", ["app.utils"])

    def test_presentation_has_no_infrastructure_imports(self):
        """presentation layer must not import from app.models, app.domain, or app.infrastructure.*."""
        self._check(
            "presentation", ["app.models", "app.domain", "app.infrastructure"]
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

    def _check_domain_cross_context(self, context_path, forbidden_contexts):
        """Verify that a domain context does not import from other domain contexts directly."""
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files(f"domain/{context_path}")):
            rel = os.path.relpath(fp, BASE)
            v = check_forbidden_imports(fp, forbidden_contexts)
            if v:
                all_violations[rel] = v
        self.assertEqual(
            {},
            all_violations,
            f"Cross-context domain imports found in domain/{context_path}:\n"
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

    def test_domain_user_no_cross_context_imports(self):
        """domain/user must not import app.domain.video/auth/chat/media directly."""
        self._check_domain_cross_context(
            "user",
            ["app.domain.video", "app.domain.auth", "app.domain.chat", "app.domain.media"],
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

    def test_infrastructure_has_no_presentation_imports(self):
        """infrastructure must not import from app.presentation (dependency direction violation)."""
        self._check("infrastructure", ["app.presentation"])

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

    def test_infrastructure_has_no_direct_app_models_imports(self):
        """infrastructure must use app.infrastructure.models as ORM import gateway."""
        all_violations = {}
        for fp in sorted(self._iter_layer_source_files("infrastructure")):
            rel = os.path.relpath(fp, BASE)
            if rel == "app/infrastructure/models/__init__.py":
                continue
            violations = check_forbidden_imports(fp, ["app.models"])
            if violations:
                all_violations[rel] = violations
        self.assertEqual(
            {},
            all_violations,
            "infrastructure must not import app.models directly:\n"
            + "\n".join(
                f"  {f}: {vs}" for f, vs in all_violations.items()
            ),
        )

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

    def _iter_app_source_relpaths(self):
        for fp in get_python_files(APP_ROOT):
            if is_test_file_path(fp):
                continue
            rel = os.path.relpath(fp, APP_ROOT).replace(os.sep, "/")
            if rel.startswith("migrations/"):
                continue
            yield rel

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

    def _iter_use_case_dto_files(self):
        for fp in sorted(self._iter_layer_source_files("use_cases")):
            name = Path(fp).name
            if name in {"dto.py", "dtos.py"}:
                yield fp

    def test_presentation_has_no_get_container_calls(self):
        self._assert_no_get_container_calls(self._rel_paths_for_layer("presentation"))

    def test_admin_has_no_presentation_tasks_imports(self):
        """admin must import task entrypoints from app.entrypoints.tasks only."""
        self._check_single_file("admin.py", ["app.presentation.tasks"])

    def test_admin_has_no_composition_root_imports(self):
        """admin must resolve use-cases via app.dependencies, not app.composition_root."""
        self._check_single_file("admin.py", ["app.composition_root"])

    def test_admin_has_no_use_cases_imports(self):
        """admin must not import app.use_cases directly."""
        self._check_single_file("admin.py", ["app.use_cases"])

    def test_admin_has_no_infrastructure_imports(self):
        """admin must not import app.infrastructure directly."""
        self._check_single_file("admin.py", ["app.infrastructure"])

    def test_non_layer_modules_are_explicitly_governed(self):
        """Files outside standard layer roots must stay in an explicit governed set."""
        governed_modules = {
            "__init__.py",
            "admin.py",
            "apps.py",
            "celery_config.py",
            "urls.py",
        }
        non_layer_files = {
            rel
            for rel in self._iter_app_source_relpaths()
            if rel.split("/", 1)[0] not in LAYER_ROOTS
        }
        self.assertEqual(
            governed_modules,
            non_layer_files,
            "New non-layer app modules found. Add explicit boundary tests for:\n"
            + "\n".join(f"  app/{p}" for p in sorted(non_layer_files - governed_modules)),
        )

    def test_urls_has_no_core_layer_imports(self):
        """app.urls stays as HTTP routing edge and must not depend on core/infrastructure layers."""
        self._check_single_file(
            "urls.py",
            [
                "app.domain",
                "app.use_cases",
                "app.infrastructure",
                "app.composition_root",
                "app.entrypoints",
            ],
        )

    def test_apps_has_no_core_layer_imports(self):
        """app.apps stays as framework bootstrap and must avoid direct core layer imports."""
        self._check_single_file(
            "apps.py",
            [
                "app.domain",
                "app.use_cases",
                "app.dependencies",
                "app.composition_root",
                "app.entrypoints",
            ],
        )

    def test_celery_config_has_no_core_layer_imports(self):
        """Celery config must not import core layers directly."""
        self._check_single_file(
            "celery_config.py",
            [
                "app.domain",
                "app.use_cases",
                "app.dependencies",
                "app.composition_root",
                "app.infrastructure",
                "app.presentation",
            ],
        )

    def test_contracts_has_no_runtime_layer_imports(self):
        """contracts must stay dependency-light and avoid runtime layer wiring."""
        self._check(
            "contracts",
            [
                "app.use_cases",
                "app.infrastructure",
                "app.presentation",
                "app.composition_root",
                "app.dependencies",
                "app.entrypoints",
            ],
        )

    def test_chat_send_message_has_no_domain_output_dto_imports(self):
        """SendMessageUseCase output boundary must not expose domain chat DTOs."""
        self._check_single_file(
            "use_cases/chat/send_message.py",
            ["app.domain.chat.dtos.CitationDTO"],
        )

    def test_auth_login_has_no_domain_token_dto_imports(self):
        """LoginUseCase must return use_cases DTOs, not domain token DTOs."""
        self._check_single_file(
            "use_cases/auth/login.py",
            ["app.domain.auth.dtos.TokenPairDto"],
        )

    def test_auth_refresh_has_no_domain_token_dto_imports(self):
        """RefreshTokenUseCase must return use_cases DTOs, not domain token DTOs."""
        self._check_single_file(
            "use_cases/auth/refresh_token.py",
            ["app.domain.auth.dtos.TokenPairDto"],
        )

    def test_video_list_groups_has_no_domain_entity_imports(self):
        """ListVideoGroupsUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/list_groups.py",
            ["app.domain.video.entities.VideoGroupEntity"],
        )

    def test_video_list_tags_has_no_domain_entity_imports(self):
        """ListTagsUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/list_tags.py",
            ["app.domain.video.entities.TagEntity"],
        )

    def test_video_create_tag_has_no_domain_entity_imports(self):
        """CreateTagUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/create_tag.py",
            ["app.domain.video.entities.TagEntity"],
        )

    def test_video_update_tag_has_no_domain_entity_imports(self):
        """UpdateTagUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/update_tag.py",
            ["app.domain.video.entities.TagEntity"],
        )

    def test_video_create_group_has_no_domain_entity_imports(self):
        """CreateVideoGroupUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/create_group.py",
            ["app.domain.video.entities.VideoGroupEntity"],
        )

    def test_video_update_group_has_no_domain_entity_imports(self):
        """UpdateVideoGroupUseCase should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/update_group.py",
            ["app.domain.video.entities.VideoGroupEntity"],
        )

    def test_video_manage_groups_has_no_domain_entity_imports(self):
        """ManageGroups use cases should expose use_cases DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/video/manage_groups.py",
            ["app.domain.video.entities.VideoGroupMemberEntity"],
        )

    def test_auth_manage_api_keys_has_no_domain_entity_imports(self):
        """API key use cases should expose auth use-case DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/auth/manage_api_keys.py",
            ["app.domain.auth.entities.ApiKeyEntity", "app.domain.auth.entities.ApiKeyCreateResult"],
        )

    def test_chat_get_history_has_no_domain_entity_imports(self):
        """GetChatHistoryUseCase should expose use-case DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/chat/get_history.py",
            ["app.domain.chat.entities.ChatLogEntity"],
        )

    def test_auth_get_current_user_has_no_domain_entity_imports(self):
        """GetCurrentUserUseCase should expose auth use-case DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/auth/get_current_user.py",
            ["app.domain.user.entities.UserEntity"],
        )

    def test_chat_submit_feedback_has_no_domain_entity_imports(self):
        """SubmitFeedbackUseCase should expose use-case DTOs, not domain entities."""
        self._check_single_file(
            "use_cases/chat/submit_feedback.py",
            ["app.domain.chat.entities.ChatLogEntity"],
        )

    def test_use_case_execute_methods_have_return_annotations(self):
        """All UseCase.execute methods must declare return types."""
        violations = []
        for fp in sorted(self._iter_layer_source_files("use_cases")):
            with open(fp) as f:
                source = f.read()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef):
                    continue
                if not node.name.endswith("UseCase"):
                    continue
                for item in node.body:
                    if (
                        isinstance(item, ast.FunctionDef)
                        and item.name == "execute"
                        and item.returns is None
                    ):
                        rel = os.path.relpath(fp, BASE)
                        violations.append(f"{rel}:{item.lineno}")
        self.assertEqual(
            [],
            violations,
            "UseCase.execute must have explicit return annotations:\n"
            + "\n".join(f"  {v}" for v in violations),
        )

    def test_use_case_execute_return_annotations_have_no_domain_dtos(self):
        """UseCase.execute return annotations must not expose app.domain.*.dtos."""
        violations = []
        for fp in sorted(self._iter_layer_source_files("use_cases")):
            with open(fp) as f:
                source = f.read()
            tree = ast.parse(source)
            alias_map = _import_alias_map(tree)
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef):
                    continue
                if not node.name.endswith("UseCase"):
                    continue
                for item in node.body:
                    if not isinstance(item, ast.FunctionDef) or item.name != "execute":
                        continue
                    for ref in _iter_annotation_refs(item.returns):
                        resolved = _resolve_annotation_ref(ref, alias_map)
                        if resolved.startswith("app.domain.") and ".dtos" in resolved:
                            rel = os.path.relpath(fp, BASE)
                            violations.append(f"{rel}:{item.lineno} -> {resolved}")
                            break
        self.assertEqual(
            [],
            violations,
            "UseCase.execute return annotation must not reference domain DTOs:\n"
            + "\n".join(f"  {v}" for v in violations),
        )

    def test_use_case_dto_annotations_have_no_any_or_bare_builtin_collections(self):
        """
        Use-case DTO type annotations must avoid Any and bare built-in collections.

        Disallowed in annotation refs:
          - Any
          - list / dict / set / tuple (without explicit type args)
        """
        violations = []
        disallowed_bare = {"list", "dict", "set", "tuple"}

        def _is_any_name(n):
            return (
                isinstance(n, ast.Name)
                and n.id == "Any"
            ) or (
                isinstance(n, ast.Attribute)
                and n.attr == "Any"
            )

        def _is_bare_builtin_collection(n):
            return isinstance(n, ast.Name) and n.id in disallowed_bare

        def _annotation_has_disallowed(n):
            if n is None:
                return None
            if _is_any_name(n):
                return "Any"
            if _is_bare_builtin_collection(n):
                return n.id
            if isinstance(n, ast.Subscript):
                # Typed collections like list[str] are allowed;
                # only inspect their type arguments.
                return _annotation_has_disallowed(n.slice)
            if isinstance(n, ast.Tuple):
                for elt in n.elts:
                    bad = _annotation_has_disallowed(elt)
                    if bad:
                        return bad
                return None
            if isinstance(n, ast.BinOp) and isinstance(n.op, ast.BitOr):
                left_bad = _annotation_has_disallowed(n.left)
                if left_bad:
                    return left_bad
                return _annotation_has_disallowed(n.right)
            return None

        for fp in self._iter_use_case_dto_files():
            with open(fp) as f:
                source = f.read()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if not isinstance(node, (ast.AnnAssign, ast.arg)):
                    continue
                annotation = node.annotation
                if annotation is None:
                    continue
                bad = _annotation_has_disallowed(annotation)
                if bad:
                    rel = os.path.relpath(fp, BASE)
                    lineno = getattr(node, "lineno", 1)
                    violations.append(f"{rel}:{lineno} -> {bad}")
        self.assertEqual(
            [],
            violations,
            "Use-case DTO annotations must not use Any or bare list/dict/set/tuple:\n"
            + "\n".join(f"  {v}" for v in violations),
        )

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

    def test_no_print_statements_in_test_files(self):
        """Test files must not contain print() calls (prevents debug noise in CI output)."""
        violations = []
        test_files = [
            str(Path(root) / f)
            for root, _, files in os.walk(APP_TESTS_ROOT)
            for f in files
            if f.endswith(".py")
        ]
        for fp in test_files:
            with open(fp, encoding="utf-8") as f:
                source = f.read()
            try:
                tree = ast.parse(source, filename=fp)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "print"
                ):
                    rel = os.path.relpath(fp, BASE)
                    violations.append(f"{rel}:{node.lineno}")
        self.assertEqual(
            [],
            violations,
            "print() calls must be removed from test files to keep CI output clean:\n"
            + "\n".join(f"  {v}" for v in violations),
        )
