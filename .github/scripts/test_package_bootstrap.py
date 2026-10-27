import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('package-bootstrap.py'))
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)
SHA = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        isolated_env = patch.dict(bootstrap.os.environ, {}, clear=True)
        isolated_env.start()
        self.addCleanup(isolated_env.stop)
        self.env = {'GITHUB_REPOSITORY': bootstrap.REPO, 'GITHUB_REF': 'refs/heads/main',
                    'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_SHA': SHA,
                    'BOOTSTRAP_WORKFLOW_SHA': SHA, 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}
        self.application = {c: {'image': {'repository': bootstrap.PREFIX+'onprem-'+c, 'digest': DIGEST}}
                            for c in ['api', 'web', 'worker']}
        self.inference = {'whisper': {'image': {'repository': bootstrap.PREFIX+'onprem-whisper', 'digest': DIGEST}}}
        self.metadata = {'repository': {'full_name': bootstrap.REPO}, 'path': '.github/workflows/onprem-release.yml',
                         'head_branch': 'main', 'event': 'workflow_run', 'status': 'completed', 'conclusion': 'success',
                         'head_sha': SHA, 'run_attempt': 2}
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.report = self.root/'report.json'

    def test_upstream_only_release_cannot_bootstrap_a_custom_gpu_namespace(self):
        with self.assertRaisesRegex(ValueError, 'no VideoQ-owned vLLM'):
            bootstrap.plan(SHA, self.application, self.inference, '123-1', vllm_only=True)
        self.assertEqual(len(bootstrap.plan(SHA, self.application, self.inference, '123-1')), 4)

    def test_source_run_binds_repository_workflow_main_success_and_attempt(self):
        with patch.object(bootstrap.subprocess, 'check_output', return_value=json.dumps(self.metadata)) as run:
            result = bootstrap.source_run('42')
        self.assertEqual(result['artifact'], 'onprem-release-'+SHA+'-attempt-2')
        self.assertEqual(run.call_args.args[0][-1], 'repos/'+bootstrap.REPO+'/actions/runs/42')
        for field, bad in [('path','other.yml'), ('head_branch','feature'), ('event','pull_request'),
                           ('status','in_progress'), ('conclusion','failure'), ('head_sha','main'), ('run_attempt',True),
                           ('repository',{'full_name':'attacker/videoq'})]:
            data = copy.deepcopy(self.metadata); data[field] = bad
            with self.subTest(field=field), patch.object(bootstrap.subprocess, 'check_output', return_value=json.dumps(data)):
                with self.assertRaises(ValueError): bootstrap.source_run('42')

    def test_invalid_run_ids_do_not_reach_github(self):
        for value in ['', '0', '-1', '../42', '42\nx=y', True, None]:
            with self.subTest(value=value), patch.object(bootstrap.subprocess,'check_output') as run:
                with self.assertRaises(ValueError): bootstrap.source_run(value)
                run.assert_not_called()

    def test_publication_rejects_forks_branches_prs_and_other_workflow_sources(self):
        for field,bad in [('GITHUB_REPOSITORY','attacker/videoq'),('GITHUB_REF','refs/heads/feature'),
                          ('GITHUB_EVENT_NAME','pull_request'),('BOOTSTRAP_WORKFLOW_SHA','c'*40),('GITHUB_RUN_ID','0')]:
            env={**self.env,field:bad}
            with self.subTest(field=field), patch.dict(bootstrap.os.environ,env,clear=True), patch.object(bootstrap.release,'verify') as verify:
                with self.assertRaises(ValueError): bootstrap.bootstrap(SHA,self.root,self.report,True)
                verify.assert_not_called()

    def test_plan_has_exactly_four_roles_and_no_gpu_latest_or_release_tags(self):
        items=bootstrap.plan(SHA,self.application,self.inference,'123-1')
        self.assertEqual([i['role'] for i in items],list(bootstrap.ROLES))
        for item in items:
            self.assertEqual(item['destination'],bootstrap.PREFIX+item['role']+':bootstrap-'+SHA+'-123-1')
            self.assertIn('@sha256:',item['source'])
        bad=copy.deepcopy(self.application); bad['api']['image']['repository']='ghcr.io/attacker/api'
        with self.assertRaises(ValueError): bootstrap.plan(SHA,bad,self.inference,'123-1')
        bad=copy.deepcopy(self.application); bad['api']['image']['digest']='latest'
        with self.assertRaises(ValueError): bootstrap.plan(SHA,bad,self.inference,'123-1')

    def test_preview_verifies_original_release_without_copying(self):
        with patch.object(bootstrap.release,'verify',return_value=(self.application,self.inference)) as verify, patch.object(bootstrap,'copy_image') as copy_image, patch('builtins.print'):
            bootstrap.bootstrap(SHA,self.root,self.report)
        verify.assert_called_once_with(self.root/'release.json',SHA)
        copy_image.assert_not_called()
        self.assertEqual(json.loads(self.report.read_text())['mode'],'preview')

    def test_vllm_only_copies_only_the_verified_gpu_index(self):
        inference = {'whisper': {'vllmImage': {'repository': bootstrap.PREFIX+'onprem-whisper-vllm', 'digest': DIGEST}}}
        items = bootstrap.plan(SHA, {}, inference, '123-1', vllm_only=True)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['source'], bootstrap.PREFIX+'onprem-whisper-vllm@'+DIGEST)
        self.assertEqual(items[0]['destination'], bootstrap.PREFIX+'vllm:bootstrap-'+SHA+'-123-1')
        inference['whisper']['vllmImage']['repository'] = bootstrap.PREFIX+'api'
        with self.assertRaises(ValueError): bootstrap.plan(SHA, {}, inference, '123-1', vllm_only=True)

    def test_vllm_bootstrap_preview_never_copies(self):
        inference = {'whisper': {'vllmImage': {'repository': bootstrap.PREFIX+'onprem-whisper-vllm', 'digest': DIGEST}}}
        with patch.object(bootstrap.release, 'verify', return_value=({}, inference)), patch.object(bootstrap, 'copy_image') as copy_image, patch('builtins.print'):
            bootstrap.bootstrap(SHA, self.root, self.report, vllm_only=True)
        copy_image.assert_not_called()
        self.assertEqual([x['role'] for x in json.loads(self.report.read_text())['images']], ['vllm'])

    def test_signature_failure_prevents_any_copy(self):
        with patch.object(bootstrap.release,'verify',side_effect=ValueError('bad signature')),patch.object(bootstrap,'copy_image') as copy_image:
            with self.assertRaisesRegex(ValueError,'bad signature'): bootstrap.bootstrap(SHA,self.root,self.report)
        copy_image.assert_not_called(); self.assertFalse(self.report.exists())

    def test_existing_matching_tag_is_idempotent_but_other_content_is_preserved(self):
        item=bootstrap.plan(SHA,self.application,self.inference,'123-1')[0]
        for actual,passing in [(DIGEST,True),('sha256:'+'c'*64,False)]:
            with patch.object(bootstrap.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=actual)) as run:
                if passing:self.assertEqual(bootstrap.copy_image(item),'already-present')
                else:
                    with self.assertRaisesRegex(ValueError,'overwrite'):bootstrap.copy_image(item)
                self.assertEqual(run.call_count,1)

    def test_remote_copy_preserves_source_digest_and_checks_destination(self):
        item=bootstrap.plan(SHA,self.application,self.inference,'123-1')[0]
        for actual in [DIGEST,'sha256:'+'c'*64]:
            with patch.object(bootstrap.subprocess,'run',side_effect=[SimpleNamespace(returncode=1),SimpleNamespace(returncode=0)]) as run,patch.object(bootstrap.subprocess,'check_output',return_value=actual):
                if actual==DIGEST:self.assertEqual(bootstrap.copy_image(item),'copied')
                else:
                    with self.assertRaisesRegex(ValueError,'differs'):bootstrap.copy_image(item)
                self.assertEqual(run.call_args.args[0],['docker','buildx','imagetools','create','--prefer-index=false','--tag',item['destination'],item['source']])

    def test_package_metadata_records_visibility_and_repository(self):
        with patch.object(bootstrap.subprocess,'check_output',return_value=json.dumps({'name':'videoq-api','visibility':'private','repository':{'full_name':bootstrap.REPO}})):
            self.assertEqual(bootstrap.package_metadata('api'),{'visibility':'private','repository':bootstrap.REPO})
        with patch.object(bootstrap.subprocess,'check_output',return_value=json.dumps({'name':'other','visibility':'public'})):
            with self.assertRaises(ValueError):bootstrap.package_metadata('api')

    def test_report_cannot_overwrite_a_signed_bundle(self):
        for output in [self.root/'release.json',self.root/'chart.tgz']:
            with patch.object(bootstrap.release,'verify') as verify:
                with self.assertRaises(ValueError):bootstrap.bootstrap(SHA,self.root,output)
                verify.assert_not_called()

    def test_workflow_preview_uses_the_exact_run_tag_without_publishing(self):
        with patch.dict(bootstrap.os.environ,{**self.env,'GITHUB_ACTIONS':'true'},clear=True),patch.object(bootstrap.release,'verify',return_value=(self.application,self.inference)),patch.object(bootstrap,'copy_image') as copy_image,patch('builtins.print'):
            bootstrap.bootstrap(SHA,self.root,self.report)
        self.assertTrue(json.loads(self.report.read_text())['images'][0]['destination'].endswith('-123-1'))
        copy_image.assert_not_called()

    def test_partial_failure_records_copies_without_rollback_or_deletion(self):
        with patch.dict(bootstrap.os.environ,self.env,clear=True),patch.object(bootstrap.release,'verify',return_value=(self.application,self.inference)),patch.object(bootstrap,'copy_image',side_effect=['copied',RuntimeError('copy failed')]),patch.object(bootstrap,'package_metadata',return_value={'visibility':'private'}):
            with self.assertRaises(RuntimeError):bootstrap.bootstrap(SHA,self.root,self.report,True)
        report=json.loads(self.report.read_text())
        self.assertEqual(report['images'][0]['result'],'copied')
        self.assertTrue(report['images'][1]['result'].startswith('failed'))
        self.assertNotIn('result',report['images'][2])


if __name__=='__main__':unittest.main()
