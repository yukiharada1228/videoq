import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("runtime_versions", Path(__file__).with_name("runtime-versions.py"))
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((runtime.ROOT / runtime.MANIFEST).read_text())

    def test_node_security_patches_do_not_wait_for_a_new_lts_line(self):
        releases = [{"version": "v26.12.1", "security": True, "lts": False},
                    {"version": "v27.0.0", "lts": False}, {"version": "v28.1.0", "lts": "Next"},
                    {"version": "v29.0.0-rc.1", "lts": False}]
        self.assertEqual(runtime.latest("26.10.0", "node", False, releases), "26.12.1")
        self.assertEqual(runtime.latest("26.10.0", "node", True, releases), "28.1.0")

    def test_python_release_lines_are_separate_and_prereleases_excluded(self):
        releases = [{"name": "Python " + v, "is_published": True, "pre_release": pre}
                    for v, pre in [("3.14.9", False), ("3.15.1", False), ("3.16.0a1", True)]]
        self.assertEqual(runtime.latest("3.14.8", "python", False, releases), "3.14.9")
        self.assertEqual(runtime.latest("3.14.8", "python", True, releases), "3.15.1")

    def test_unknown_next_line_does_not_duplicate_current_line_digest_updates(self):
        with patch.object(runtime, "request", return_value=[{"version": "v26.12.1", "lts": False}]) as request:
            self.assertEqual(runtime.discover(runtime.ROOT, self.data, "node", True), self.data)
            self.assertEqual(request.call_count, 1)

    def test_versions_and_archive_sources_cannot_inject_commands(self):
        for value in ["26", "26.12.1;echo bad", "26.12.1-rc.1", "$(touch file)"]:
            with self.assertRaises(ValueError):
                runtime.version(value)
        if "modal_python" in self.data:
            bad = copy.deepcopy(self.data)
            bad["modal_python"]["url"] = "https://example.invalid/python.tar.gz"
            with self.assertRaises(ValueError):
                runtime.validate(bad)

    def test_missing_standalone_build_is_an_error_not_an_old_python_fallback(self):
        with self.assertRaises(ValueError):
            runtime.standalone("3.15.1", [{"assets": []}])

    def test_image_manifest_must_cover_both_production_architectures(self):
        def response(url, headers=None, raw=False):
            return b'{"manifests":[{"platform":{"architecture":"amd64"}}]}' if raw else {"token": "not-a-secret"}
        with patch.object(runtime, "request", side_effect=response), self.assertRaises(ValueError):
            runtime.image_digest("node", "26.12.1-bookworm-slim")

    def test_tool_major_updates_cannot_block_current_line_security_fixes(self):
        versions = ["12.2.1", "13.0.0", "14.0.0-rc.1"]
        self.assertEqual(runtime.managers.newer("12.2.0", "npm", False, versions), "12.2.1")
        self.assertEqual(runtime.managers.newer("12.2.0", "npm", True, versions), "13.0.0")
        self.assertEqual(runtime.managers.newer("0.13.4", "uv", False, ["0.13.5", "0.14.0"]), "0.13.5")
        self.assertEqual(runtime.managers.newer("0.13.4", "uv", True, ["0.13.5", "0.14.0"]), "0.14.0")

    def test_changed_distribution_bytes_are_rejected_before_extraction_or_execution(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_): return b"tampered archive"
        with patch.object(runtime.managers.urllib.request, "urlopen", return_value=Response()), self.assertRaisesRegex(ValueError, "hash mismatch"):
            runtime.managers.verified({"url": "https://example.invalid", "sha256": "0" * 64})

    def test_tool_pins_require_exact_official_distribution_urls(self):
        for name in ["npm", "pip"]:
            bad = copy.deepcopy(self.data)
            bad["tool_downloads"][name]["url"] = "https://example.invalid/payload"
            with self.assertRaises(ValueError):
                runtime.validate(bad)

    def test_render_is_idempotent_and_keeps_package_dependencies(self):
        files = runtime.rendered(runtime.ROOT, self.data)
        before = json.loads((runtime.ROOT / "package.json").read_text())
        after = json.loads(files["package.json"])
        for field in ["dependencies", "devDependencies", "overrides", "peerDependencies"]:
            self.assertEqual(before.get(field), after.get(field))
        for name, content in files.items():
            self.assertEqual((runtime.ROOT / name).read_text(), content, name)
        self.assertEqual(files[".node-version"].strip(), self.data["node"])
        self.assertEqual(files[".python-version"].strip(), self.data["python"])


if __name__ == "__main__":
    unittest.main()
