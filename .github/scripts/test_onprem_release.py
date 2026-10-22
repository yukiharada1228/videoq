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
        self.chart = self.root / ('videoq-0.1.0-sha.' + SOURCE + '.tgz')
        self.chart.write_bytes(b'reviewed chart fixture')
        self.data = {'schemaVersion': 1, 'repository': release.REPOSITORY, 'sourceSha': SOURCE,
                     'platforms': ['linux/amd64', 'linux/arm64'],
                     'images': {c: {'repository': release.PREFIX + c, 'digest': 'sha256:' + 'b' * 64} for c in release.COMPONENTS},
                     'chart': {'name': self.chart.name, 'digest': 'sha256:' + release.hashlib.sha256(self.chart.read_bytes()).hexdigest()}}
        self.manifest = self.root / 'release.json'
        self.manifest.write_text(json.dumps(self.data))

    def test_verification_pins_oidc_workflow_source_ref_and_commit(self):
        with patch.object(release.subprocess, 'run') as run:
            values = release.verify(self.manifest, SOURCE)
        self.assertTrue(values['requireImageDigests'])
        self.assertEqual(run.call_count, 5)
        for call in run.call_args_list:
            command = call.args[0]
            self.assertIn('--deny-self-hosted-runners', command)
            for flag, expected in [('--repo', release.REPOSITORY), ('--signer-workflow', release.WORKFLOW),
                                   ('--source-digest', SOURCE), ('--source-ref', 'refs/heads/main')]:
                self.assertEqual(command[command.index(flag) + 1], expected)
            self.assertTrue(call.kwargs['check'])
        self.assertIn('@sha256:', run.call_args_list[-1].args[0][3])

    def test_missing_or_invalid_signature_aborts(self):
        for failure in range(5):
            with self.subTest(failure=failure), patch.object(release.subprocess, 'run', side_effect=[None] * failure + [subprocess.CalledProcessError(1, 'gh')]):
                with self.assertRaises(subprocess.CalledProcessError):
                    release.verify(self.manifest, SOURCE)

    def test_changed_chart_bytes_abort(self):
        self.chart.write_bytes(b'tampered')
        with patch.object(release.subprocess, 'run'), self.assertRaisesRegex(ValueError, 'Chart bytes'):
            release.verify(self.manifest, SOURCE)

    def test_wrong_repository_commit_architecture_component_or_path_abort(self):
        candidates = []
        for field, value in [('repository', 'attacker/videoq'), ('sourceSha', 'c' * 40), ('platforms', ['linux/amd64'])]:
            bad = copy.deepcopy(self.data); bad[field] = value; candidates.append(bad)
        for field, value in [('repository', 'ghcr.io/attacker/api'), ('digest', 'latest'), ('digest', 'sha256:' + '0' * 64)]:
            bad = copy.deepcopy(self.data); bad['images']['api'][field] = value; candidates.append(bad)
        bad = copy.deepcopy(self.data); bad['chart']['name'] = '../chart.tgz'; candidates.append(bad)
        bad = copy.deepcopy(self.data); del bad['images']['worker']; candidates.append(bad)
        for bad in candidates:
            with self.subTest(data=bad), self.assertRaises(ValueError):
                release.validate(bad, SOURCE)

    def test_failure_does_not_replace_existing_values(self):
        output = self.root / 'values.json'
        output.write_text('existing reviewed values')
        with patch.object(release, 'verify', side_effect=ValueError('bad signature')), patch('sys.argv', ['script', 'verify', SOURCE, str(self.manifest), str(output)]):
            with self.assertRaises(ValueError): release.main()
        self.assertEqual(output.read_text(), 'existing reviewed values')


if __name__ == '__main__':
    unittest.main()
