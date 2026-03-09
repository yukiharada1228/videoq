"""Governance checks for ubiquitous-language issue/PR templates."""

from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent


class GovernanceTemplateRulesTest(unittest.TestCase):
    """Ensure repository templates enforce ubiquitous-language process rules."""

    def test_pr_template_is_backend_only_and_enforces_term_tracking(self):
        pr_template = REPO_ROOT / ".github" / "PULL_REQUEST_TEMPLATE" / "backend.md"
        self.assertTrue(pr_template.exists(), "Missing .github/PULL_REQUEST_TEMPLATE/backend.md")
        content = pr_template.read_text(encoding="utf-8")

        required_snippets = [
            "Backend PR Only",
            "Use this template only for backend changes in `backend/`.",
            "Backend Context: (`Auth` / `Video` / `Chat`)",
            "first line",
            "Video group` / `Chat group context",
            "I listed domain terms added/changed in this PR.",
            "I avoided ambiguous terms (`group`, `token`, `user`) without context.",
            "### Added/Changed Domain Terms (Backend)",
        ]
        for snippet in required_snippets:
            self.assertIn(snippet, content)

    def test_spec_issue_template_is_backend_only_and_requires_context_and_term_check(self):
        issue_template = REPO_ROOT / ".github" / "ISSUE_TEMPLATE" / "spec_discussion.yml"
        self.assertTrue(
            issue_template.exists(),
            "Missing .github/ISSUE_TEMPLATE/spec_discussion.yml",
        )
        content = issue_template.read_text(encoding="utf-8")

        required_snippets = [
            "name: Backend Spec Discussion",
            "title: \"[Backend Spec] \"",
            "- backend",
            "label: Backend Context",
            "Video (Recommended)",
            "Added/Changed Domain Terms (Backend)",
            "Video group / Chat group context",
            "Ubiquitous Language Checks (Backend)",
            "I avoided ambiguous terms (`group`, `token`, `user`) without context.",
        ]
        for snippet in required_snippets:
            self.assertIn(snippet, content)


if __name__ == "__main__":
    unittest.main()
