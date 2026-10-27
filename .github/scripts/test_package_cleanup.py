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
        for version in (2, 6, True):
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
        def api(name, method='GET', *, schema=3):
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

    def test_schema_four_deletes_only_old_gpu_and_retains_all_five_new_packages(self):
        manifest = {'schemaVersion': 4, 'images': {n: {'repository': 'ghcr.io/'+cleanup.OWNER+'/'+n} for n in cleanup.RENAMED_ACTIVE}}
        with patch.object(cleanup, 'api', side_effect=self.metadata):
            items = cleanup.plan(manifest)
        self.assertEqual(items, [{'package': cleanup.GPU, 'result': 'planned'}])
        with tempfile.TemporaryDirectory() as directory, patch.object(cleanup, 'api') as api:
            api.side_effect = [None, None] + [self.metadata(n) for n in cleanup.RENAMED_ACTIVE]
            cleanup.execute(items, Path(directory)/'report.json', True, schema=4)
            api.assert_any_call(cleanup.GPU, 'DELETE', schema=4)
            self.assertEqual(sum(c.args[1:] == ('DELETE',) for c in api.call_args_list), 1)
        with self.assertRaises(ValueError): cleanup.api('videoq-vllm', 'DELETE', schema=4)
        with self.assertRaises(ValueError): cleanup.api(cleanup.GPU, 'DELETE')
        manifest['images'].pop('videoq-vllm')
        manifest['images'][cleanup.GPU] = {'repository': 'ghcr.io/'+cleanup.OWNER+'/'+cleanup.GPU}
        with self.assertRaises(ValueError): cleanup.plan(manifest)


    def test_schema_five_retires_only_current_custom_vllm_after_upstream_release(self):
        manifest = {'schemaVersion': 5, 'images': {n: {'repository': 'ghcr.io/'+cleanup.OWNER+'/'+n} for n in cleanup.CURRENT}}
        with patch.object(cleanup, 'api', side_effect=self.metadata):
            items = cleanup.plan(manifest)
        self.assertEqual(items, [{'package': 'videoq-vllm', 'result': 'planned'}])
        with tempfile.TemporaryDirectory() as directory, patch.object(cleanup, 'api') as api:
            api.side_effect = [None, None]+[self.metadata(n) for n in cleanup.CURRENT]
            cleanup.execute(items, Path(directory)/'report.json', True, schema=5)
            api.assert_any_call('videoq-vllm', 'DELETE', schema=5)
            self.assertEqual(sum(c.args[1:] == ('DELETE',) for c in api.call_args_list), 1)
        for name in (*cleanup.CURRENT, cleanup.GPU, *cleanup.RETIRED):
            with self.subTest(package=name), self.assertRaises(ValueError): cleanup.api(name, 'DELETE', schema=5)
        manifest['images']['vllm-engine'] = {'repository': 'ghcr.io/'+cleanup.OWNER+'/videoq-vllm'}
        with self.assertRaises(ValueError): cleanup.plan(manifest)

    def test_retirement_generations_cannot_be_mixed(self):
        for schema, wrong in ((3, cleanup.GPU), (4, cleanup.CUSTOM_GPU), (5, cleanup.GPU)):
            with tempfile.TemporaryDirectory() as directory, self.subTest(schema=schema), patch.object(cleanup, 'api') as api:
                with self.assertRaises(ValueError):
                    cleanup.execute([{'package': wrong, 'result': 'planned'}], Path(directory)/'report.json', True, schema=schema)
                api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
