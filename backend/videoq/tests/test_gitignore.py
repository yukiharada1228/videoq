"""
CI test: verify that .gitignore covers locally generated artifacts.

Acceptance criteria:
  - __pycache__ directories are ignored
  - Compiled Python files (*.pyc, *.pyo) are ignored
  - node_modules directory is ignored
  - Frontend build output (dist/) is ignored
  - Python test/analysis cache directories are ignored
  - Coverage output is ignored
  - Log files are ignored
  - whisper.cpp build artifacts are ignored
"""

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

REQUIRED_PATTERNS = [
    # Python
    "__pycache__",
    "*.pyc",
    "*.pyo",
    # Node / frontend
    "node_modules",
    "dist",
    # Test / analysis tools
    ".pytest_cache",
    ".mypy_cache",
    ".coverage",
    "coverage",
    # Logs
    "*.log",
    # whisper.cpp build artifacts
    "*.o",
    "*.a",
]


class GitignoreCoverageTests(unittest.TestCase):
    def setUp(self):
        gitignore_path = REPO_ROOT / ".gitignore"
        self.assertTrue(
            gitignore_path.exists(),
            f".gitignore not found at repo root ({REPO_ROOT})",
        )
        lines = gitignore_path.read_text(encoding="utf-8").splitlines()
        self.patterns = {
            line.strip()
            for line in lines
            if line.strip() and not line.strip().startswith("#")
        }

    def test_required_patterns_present(self):
        missing = [p for p in REQUIRED_PATTERNS if p not in self.patterns]
        self.assertEqual(
            missing,
            [],
            f".gitignore is missing required patterns: {missing}",
        )
