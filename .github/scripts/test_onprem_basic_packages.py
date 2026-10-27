import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('basic', Path(__file__).with_name('onprem-basic-packages.py'))
basic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(basic)


class BasicPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.values = self.root / 'values.json'
        self.output = self.root / 'output'
        self.values.write_text(json.dumps({'llamacpp': {'image': {'repository': 'ghcr.io/test/llama', 'digest': 'sha256:' + 'a' * 64}},
                                          'whispercpp': {'images': {arch: {'repository': 'ghcr.io/test/whisper', 'digest': 'sha256:' + digest * 64}
                                                                    for arch, digest in [('amd64', 'b'), ('arm64', 'c')]}}}))

    def invoke(self, architecture):
        with patch('sys.argv', ['check', str(self.values), str(self.output), '--architecture', architecture]):
            basic.main()

    def test_architecture_mismatch_fails_before_running_packages(self):
        with patch.object(basic.platform, 'machine', return_value='x86_64'), patch.object(basic, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'native architecture'):
                self.invoke('arm64')
        run.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_native_arm_selects_arm_image_without_emulation_or_gpu(self):
        with patch.object(basic.platform, 'machine', return_value='aarch64'), patch.object(basic.platform, 'system', return_value='Linux'), patch.object(basic, 'run', return_value='--host --port') as run, patch('builtins.print'):
            self.invoke('arm64')
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn('linux/arm64', commands[0])
        self.assertIn('sha256:' + 'c' * 64, commands[2][-1])
        for command in [commands[1], commands[3]]:
            self.assertEqual(command[command.index('--network') + 1], 'none')
            self.assertNotIn('--gpus', command)
        report = json.loads((self.output / 'packages.json').read_text())
        self.assertEqual(report['architecture'], 'arm64')
        self.assertIn('no model downloads', report['scope'])

    def test_missing_server_cli_flags_cannot_produce_a_passing_report(self):
        with patch.object(basic.platform, 'machine', return_value='x86_64'), patch.object(basic.platform, 'system', return_value='Linux'), patch.object(basic, 'run', return_value='client executable only'):
            with self.assertRaisesRegex(RuntimeError, 'server CLI contract'):
                self.invoke('amd64')
        self.assertFalse((self.output / 'packages.json').exists())

    def test_missing_homebrew_server_cannot_produce_a_passing_report(self):
        with patch.object(basic.platform, 'machine', return_value='arm64'), patch.object(basic.platform, 'system', return_value='Darwin'), patch.object(basic, 'run', return_value='formula 1.0'), patch.object(basic.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'missing llama-server'):
                self.invoke('arm64')
        self.assertFalse((self.output / 'packages.json').exists())

    def test_mutable_or_malformed_images_are_rejected(self):
        for digest in ['', 'latest', 'sha256:' + 'a' * 63]:
            with self.subTest(digest=digest), self.assertRaises(ValueError):
                basic.image_reference({'repository': 'ghcr.io/test/llama', 'digest': digest})


if __name__ == '__main__':
    unittest.main()
