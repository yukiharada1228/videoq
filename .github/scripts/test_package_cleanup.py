import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cleanup', Path(__file__).with_name('package-cleanup.py'))
cleanup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    def manifest(self):
        return {'schemaVersion': 3, 'images': {n: {'repository': 'ghcr.io/' + cleanup.OWNER + '/' + n} for n in cleanup.ACTIVE}}

    def metadata(self, name, method='GET'):
        return {'name': name, 'visibility': 'public', 'repository': {'full_name': cleanup.REPO}}

    def test_plan_excludes_every_live_package(self):
        with patch.object(cleanup, 'api', side_effect=self.metadata):
            items = cleanup.plan(self.manifest())
        self.assertEqual([i['package'] for i in items], list(cleanup.RETIRED))
        self.assertTrue(set(cleanup.RETIRED).isdisjoint(cleanup.ACTIVE))

    def test_rejects_legacy_and_changed_live_references(self):
        for version in (2, 4):
            m = self.manifest(); m['schemaVersion'] = version
            with self.assertRaises(ValueError): cleanup.plan(m)
        m = self.manifest(); m['images']['extra'] = {'repository': 'ghcr.io/' + cleanup.OWNER + '/videoq-onprem-api'}
        with self.assertRaises(ValueError): cleanup.plan(m)

    def test_wrong_repository_or_missing_retained_package_aborts(self):
        for response in (None, {'name': cleanup.ACTIVE[0], 'visibility': 'public', 'repository': {'full_name': 'other/repo'}}):
            with patch.object(cleanup, 'api', return_value=response), self.assertRaises(ValueError):
                cleanup.plan(self.manifest())

    def test_preview_never_deletes(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cleanup, 'api', side_effect=self.metadata) as api:
            cleanup.execute([{'package': n, 'result': 'planned'} for n in cleanup.RETIRED], Path(directory) / 'report.json')
            self.assertFalse(any(len(c.args) > 1 for c in api.call_args_list))

    def test_api_rejects_active_package_deletion(self):
        for name in cleanup.ACTIVE:
            with self.assertRaises(ValueError): cleanup.api(name, 'DELETE')

    def test_deletion_and_partial_failure_report(self):
        items = [{'package': n, 'result': 'planned'} for n in cleanup.RETIRED]
        deleted = set()
        def api(name, method='GET'):
            if method == 'DELETE':
                if deleted: raise RuntimeError('HTTP 403')
                deleted.add(name)
            return None if name in deleted else self.metadata(name)
        with tempfile.TemporaryDirectory() as directory, patch.object(cleanup, 'api', side_effect=api):
            output = Path(directory) / 'report.json'
            with self.assertRaises(RuntimeError): cleanup.execute(items, output, True)
            self.assertTrue(output.exists())
            self.assertEqual(items[0]['result'], 'deleted')
            self.assertEqual(items[1]['result'], 'planned')


if __name__ == '__main__':
    unittest.main()
