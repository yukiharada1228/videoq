import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
import json

spec=importlib.util.spec_from_file_location('mac',Path(__file__).with_name('onprem-mac-acceptance.py'))
mac=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mac)


class NativeRouteContractTests(unittest.TestCase):
    def test_native_missing_file_json_is_supported_with_both_observed_status_codes(self):
        for status in (200,400):
            with self.subTest(status=status),patch.object(mac.http.client,'HTTPConnection') as make:
                response=make.return_value.getresponse.return_value
                response.status=status;response.read.return_value=b'{"error":"no \'file\' field in the request"}'
                self.assertEqual(mac.probe_whisper_route()['status'],status)
                make.return_value.request.assert_called_once_with('POST','/v1/audio/transcriptions',body=b'')
                make.return_value.close.assert_called_once()

    def test_a_health_page_unknown_route_or_other_error_is_not_evidence_of_the_transcription_route(self):
        for status,body in [(200,b'{"status":"ok"}'),(404,b'{"error":"no \'file\' field in the request"}'),(200,b'{"error":"not found"}')]:
            with self.subTest(status=status,body=body),patch.object(mac.http.client,'HTTPConnection') as make:
                response=make.return_value.getresponse.return_value;response.status=status;response.read.return_value=body
                with self.assertRaises(ValueError):mac.probe_whisper_route()
                make.return_value.close.assert_called_once()


class ExplicitModelIdentityTests(unittest.TestCase):
    def test_identity_requires_pinned_revision_digest_and_a_single_gguf_filename(self):
        valid={'modelRepo':'quantizer/model','modelRevision':'a'*40,'modelFile':'chat-Q4_K_M.gguf','modelSha256':'b'*64}
        with TemporaryDirectory() as directory:
            path=Path(directory)/'model.json';path.write_text(json.dumps(valid))
            self.assertEqual(mac.chat_override(path),valid)
            for key,value in [('modelRevision','main'),('modelSha256',''),('modelFile','../chat.gguf'),('modelRepo','https://example.com/model')]:
                with self.subTest(key=key):
                    path.write_text(json.dumps({**valid,key:value}))
                    with self.assertRaises(ValueError):mac.chat_override(path)


class WorkloadRestoreTests(unittest.TestCase):
    def test_stopped_or_unavailable_workload_cannot_hide_a_later_resume(self):
        from types import SimpleNamespace
        items=[{'id':'stopped','name':'a'},{'id':'removed','name':'b'},{'id':'paused','name':'c'}]
        def run(command,**kwargs):
            if command[:2]==['docker','inspect']:
                if command[2]=='removed':return SimpleNamespace(returncode=1,stdout='')
                return SimpleNamespace(returncode=0,stdout=json.dumps([{'State':{'Running':command[2]!='stopped','Paused':True}}]))
            return SimpleNamespace(returncode=0,stdout='')
        with patch.object(mac.subprocess,'run',side_effect=run) as process:
            errors=mac.restore_paused_workloads(items)
        self.assertEqual(len(errors),2)
        self.assertEqual(items[-1]['resumeStatus'],'resumed')
        self.assertTrue(any(call.args[0]==['docker','unpause','paused'] for call in process.call_args_list))


class ApiSourceIdentityTests(unittest.TestCase):
    def test_only_an_explicit_matching_arm64_source_build_is_accepted(self):
        image='sha256:'+'a'*64;revision='b'*40
        valid={'Id':image,'Architecture':'arm64','Config':{'Labels':{'org.opencontainers.image.revision':revision}}}
        with patch.object(mac.subprocess,'check_output',return_value=json.dumps([valid])):
            self.assertEqual(mac.api_source_identity(image,revision)['sourceSha'],revision)
        for invalid in [{**valid,'Architecture':'amd64'},{**valid,'Id':'sha256:'+'c'*64},{**valid,'Config':{'Labels':None}}]:
            with self.subTest(invalid=invalid),patch.object(mac.subprocess,'check_output',return_value=json.dumps([invalid])):
                with self.assertRaises(ValueError):mac.api_source_identity(image,revision)
        with patch.object(mac.subprocess,'check_output') as command:
            with self.assertRaises(ValueError):mac.api_source_identity('mutable:tag',revision)
            command.assert_not_called()


if __name__=='__main__':unittest.main()
