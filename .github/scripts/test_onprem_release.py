import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('release', Path(__file__).with_name('onprem-release.py'))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
SOURCE = 'a' * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.charts = {key: self.root / (name + '-0.1.0-sha.' + SOURCE + '.tgz') for key, name in release.CHARTS.items()}
        for chart in self.charts.values(): chart.write_bytes(b'reviewed chart fixture')
        self.data = {'schemaVersion': 2, 'repository': release.REPOSITORY, 'sourceSha': SOURCE,
                     'images': {c: {'repository': release.PREFIX + c, 'platforms': release.PLATFORMS[c], 'digest': 'sha256:' + 'b' * 64} for c in release.COMPONENTS},
                     'charts': {key: {'name': chart.name, 'digest': 'sha256:' + release.hashlib.sha256(chart.read_bytes()).hexdigest()} for key, chart in self.charts.items()}}
        self.manifest = self.root / 'release.json'
        self.manifest.write_text(json.dumps(self.data))

    def test_verification_pins_oidc_workflow_source_ref_and_commit(self):
        with patch.object(release.subprocess, 'run') as run:
            values, inference = release.verify(self.manifest, SOURCE)
        self.assertTrue(values['requireImageDigests'])
        self.assertTrue(inference['requireImageDigests'])
        self.assertEqual(inference['whisper']['image']['repository'], release.PREFIX + 'whisper')
        self.assertEqual(inference['whisper']['vllmImage'], inference['vllm']['image'])
        self.assertEqual(run.call_count, 8)
        for call in run.call_args_list:
            command = call.args[0]
            self.assertIn('--deny-self-hosted-runners', command)
            for flag, expected in [('--repo', release.REPOSITORY), ('--signer-workflow', release.WORKFLOW),
                                   ('--source-digest', SOURCE), ('--source-ref', 'refs/heads/main')]:
                self.assertEqual(command[command.index(flag) + 1], expected)
            self.assertTrue(call.kwargs['check'])
        self.assertIn('@sha256:', run.call_args_list[-1].args[0][3])

    def test_missing_or_invalid_signature_aborts(self):
        for failure in range(8):
            with self.subTest(failure=failure), patch.object(release.subprocess, 'run', side_effect=[None] * failure + [subprocess.CalledProcessError(1, 'gh')]):
                with self.assertRaises(subprocess.CalledProcessError):
                    release.verify(self.manifest, SOURCE)

    def test_changed_chart_bytes_abort(self):
        for chart in self.charts.values():
            with self.subTest(chart=chart):
                chart.write_bytes(b'tampered')
                with patch.object(release.subprocess, 'run'), self.assertRaisesRegex(ValueError, 'Chart bytes'):
                    release.verify(self.manifest, SOURCE)
                chart.write_bytes(b'reviewed chart fixture')

    def test_wrong_repository_commit_architecture_component_or_path_abort(self):
        candidates = []
        for field, value in [('repository', 'attacker/videoq'), ('sourceSha', 'c' * 40), ('schemaVersion', 1)]:
            bad = copy.deepcopy(self.data); bad[field] = value; candidates.append(bad)
        for field, value in [('repository', 'ghcr.io/attacker/api'), ('digest', 'latest'), ('digest', 'sha256:' + '0' * 64)]:
            bad = copy.deepcopy(self.data); bad['images']['api'][field] = value; candidates.append(bad)
        for component in ['api', 'whisper-vllm']:
            bad = copy.deepcopy(self.data); bad['images'][component]['platforms'] = ['linux/arm64']; candidates.append(bad)
        bad = copy.deepcopy(self.data); bad['charts']['inference']['name'] = '../chart.tgz'; candidates.append(bad)
        bad = copy.deepcopy(self.data); del bad['images']['worker']; candidates.append(bad)
        bad = copy.deepcopy(self.data); del bad['images']['whisper']; candidates.append(bad)
        bad = copy.deepcopy(self.data); del bad['charts']['inference']; candidates.append(bad)
        for bad in candidates:
            with self.subTest(data=bad), self.assertRaises(ValueError):
                release.validate(bad, SOURCE)

    def test_failure_does_not_replace_existing_values(self):
        output = self.root / 'values.json'
        output.write_text('existing reviewed values')
        inference = self.root / 'inference.json'
        inference.write_text('existing inference values')
        with patch.object(release, 'verify', side_effect=ValueError('bad signature')), patch('sys.argv', ['script', 'verify', SOURCE, str(self.manifest), str(output), str(inference)]):
            with self.assertRaises(ValueError): release.main()
        self.assertEqual(output.read_text(), 'existing reviewed values')
        self.assertEqual(inference.read_text(), 'existing inference values')

    def test_cannot_overwrite_signed_artifacts_or_share_output_paths(self):
        output = self.root / 'values.json'
        for first, second in [(self.manifest, output), (output, self.charts['inference']), (output, output)]:
            with patch('sys.argv', ['script', 'verify', SOURCE, str(self.manifest), str(first), str(second)]), patch.object(release, 'verify') as verify:
                with self.assertRaises(ValueError): release.main()
                verify.assert_not_called()


if __name__ == '__main__':
    unittest.main()
