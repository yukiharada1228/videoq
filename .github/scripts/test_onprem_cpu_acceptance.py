import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cpu', Path(__file__).with_name('onprem-cpu-acceptance.py'))
cpu = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cpu)


class AcceptanceSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = self.root / 'release'
        self.bundle.mkdir()
        self.manifest = self.bundle / 'release.json'
        self.manifest.write_text('{}')
        self.argv = patch('sys.argv', ['script', 'a'*40, str(self.bundle), str(self.root/'evidence')])
        self.argv.start()
        self.addCleanup(self.argv.stop)

    def test_invalid_signature_prevents_every_docker_or_cluster_action(self):
        with patch.object(cpu.release, 'verify', side_effect=ValueError('bad signature')), patch.object(cpu.subprocess, 'check_output') as read, patch.object(cpu.subprocess, 'run') as mutate:
            with self.assertRaisesRegex(ValueError, 'bad signature'): cpu.main()
        read.assert_not_called()
        mutate.assert_not_called()

    def test_recognition_quality_and_timestamps_must_both_pass(self):
        case = {'duration':10.44,'reference':'現地企業の住所です。'}
        actual = '1\n00:00:00,000 --> 00:00:10,000\n現地企業の住所です。\n'
        self.assertEqual(cpu.assess_transcript(actual,case)['cer'],0)
        for bad in ['', actual.replace('00:00:10,000','00:00:20,000'), actual.replace('現地企業の住所です。','全く別の内容で回答しています。')]:
            with self.subTest(transcript=bad), self.assertRaises(ValueError): cpu.assess_transcript(bad,case)

    def test_existing_cluster_is_never_replaced_or_deleted(self):
        metadata = {'charts': {'application': {'name': 'app.tgz'}, 'inference': {'name': 'inference.tgz'}}}
        with patch.object(cpu.release, 'verify', return_value=({}, {})), patch.object(cpu.release, 'validate', return_value=metadata), patch.object(cpu.subprocess, 'check_output', return_value='videoq-onprem-lab\n') as read, patch.object(cpu.subprocess, 'run') as mutate:
            with self.assertRaisesRegex(RuntimeError, 'already exists'): cpu.main()
        self.assertEqual(read.call_args.args[0], ['kind', 'get', 'clusters'])
        mutate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
