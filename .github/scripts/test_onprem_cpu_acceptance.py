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
        inference = {'whisper': {'image': {'repository':'ghcr.io/test/whisper','digest':'sha256:'+'b'*64}}}
        with patch.object(cpu.release, 'verify', return_value=({}, inference)), patch.object(cpu.release, 'validate', return_value=metadata), patch.object(cpu.subprocess, 'check_output', return_value='videoq-onprem-lab\n') as read, patch.object(cpu.subprocess, 'run') as mutate:
            with self.assertRaisesRegex(RuntimeError, 'already exists'): cpu.main()
        self.assertEqual(read.call_args.args[0], ['kind', 'get', 'clusters'])
        mutate.assert_not_called()

    def test_public_egress_firewall_covers_node_and_pod_ipv4_and_ipv6(self):
        info = {'IPAM':{'Config':[{'Subnet':'172.29.0.0/16','Gateway':'172.29.0.1'}]}}
        with patch.object(cpu.subprocess,'run') as mutate, patch.object(cpu.subprocess,'check_output',return_value='installed rules'):
            policy = cpu.isolate_node(info)
        commands = [call.args[0] for call in mutate.call_args_list]
        for binary in ['iptables','ip6tables']:
            rules = [c for c in commands if c[3] == binary]
            for hook in ['OUTPUT','FORWARD']:
                self.assertTrue(any(c[-4:] == ['-C',hook,'-j','VIDEOQ-CPU-EGRESS'] for c in rules))
            self.assertTrue(any(c[-4:] == ['-A','VIDEOQ-CPU-EGRESS','-j','REJECT'] for c in rules))
            for c in rules:
                if c[-1] == 'RETURN': self.assertIn('-d',c)
        gateway = [c for c in commands if c[3] == 'iptables' and '-d' in c and c[c.index('-d')+1] == '172.29.0.1']
        self.assertIn('ESTABLISHED,RELATED',gateway[0])
        self.assertEqual(gateway[1][-1],'REJECT')
        self.assertEqual(policy['blockedHostGateway'],'172.29.0.1')

    def test_unexpected_networks_fail_before_installing_firewall_rules(self):
        for subnet, gateway in [('8.8.8.0/24','8.8.8.1'),('172.29.0.0/16','172.30.0.1'),('10.244.0.0/16','10.244.0.1')]:
            with self.subTest(subnet=subnet), patch.object(cpu.subprocess,'run') as mutate:
                with self.assertRaises(ValueError): cpu.isolate_node({'IPAM':{'Config':[{'Subnet':subnet,'Gateway':gateway}]}})
                mutate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
