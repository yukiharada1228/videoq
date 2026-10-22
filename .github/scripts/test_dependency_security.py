import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("dependency_security", pathlib.Path(__file__).with_name("dependency-security.py"))
security = importlib.util.module_from_spec(spec)
spec.loader.exec_module(security)


class SecurityTests(unittest.TestCase):
    def test_all_batches_and_advisories_are_reported(self):
        packages = [("npm", "package", str(i)) for i in range(201)]
        calls = []
        def query(payload):
            calls.append(len(payload["queries"]))
            return {"results": [{"vulns": [{"id": "GHSA-test"}]} for _ in payload["queries"]]}
        report = security.scan(packages, query)
        self.assertEqual(calls, [100, 100, 1])
        self.assertEqual(report["status"], "findings")
        self.assertEqual(len(report["details"]), 201)

    def test_incomplete_or_paginated_results_are_never_healthy(self):
        for response in ({}, {"results": []}, {"results": [{"next_page_token": "next"}]}):
            with self.assertRaises(ValueError):
                security.scan([("npm", "foo", "1.0.0")], lambda _: response)

    def test_empty_results_are_healthy(self):
        report = security.scan([("npm", "foo", "1.0.0")], lambda _: {"results": [{}]})
        self.assertEqual(report["status"], "ok")
