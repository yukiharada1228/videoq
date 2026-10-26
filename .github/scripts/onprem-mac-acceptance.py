"""Measure a verified VideoQ release with native Metal inference on one Mac.

All model weights are verified before serving. Only a new dedicated kind cluster
is modified. Native AI processes have loopback-only outbound sandbox policies;
the node permits only the three native API ports in addition to private traffic.
Generated demos and full result text remain in the operator's local directory.
"""
import argparse
import hashlib
import http.client
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import subprocess
import time
import urllib.request
import urllib.error
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
CLUSTER = "videoq-mac-demo-lab"
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
SPEC = importlib.util.spec_from_file_location('cpu_acceptance', Path(__file__).with_name('onprem-cpu-acceptance.py'))
cpu = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cpu)


def checksum(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024*1024), b''): result.update(part)
    return result.hexdigest()


def api_source_identity(image_id, revision):
    """A local source build is explicitly separate from the signed baseline."""
    revision=cpu.release.sha(revision)
    if not re.fullmatch(r'sha256:[a-f0-9]{64}',image_id):raise ValueError('Use an immutable local API image config ID')
    data=json.loads(subprocess.check_output(['docker','image','inspect',image_id],text=True))[0]
    if data['Id']!=image_id or data['Architecture']!='arm64' or (data['Config'].get('Labels') or {}).get('org.opencontainers.image.revision')!=revision:
        raise ValueError('Local API image identity, revision label or architecture mismatch')
    return {'imageConfigId':image_id,'sourceSha':revision,'architecture':'arm64','verification':'local source build; revision label and config ID checked; not a signed release image'}


def chat_override(path):
    """An explicit weight experiment never inherits the signed chart's identity."""
    data=json.loads(path.read_text())
    patterns={'modelRepo':r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',
              'modelRevision':r'[a-f0-9]{40}','modelFile':r'[A-Za-z0-9_.-]+\.gguf',
              'modelSha256':r'[a-f0-9]{64}'}
    for key,pattern in patterns.items():
        if not isinstance(data.get(key),str) or not re.fullmatch(pattern,data[key]):
            raise ValueError('Invalid explicit chat model identity: '+key)
    return {key:data[key] for key in patterns}


def probe_whisper_route(port=8081):
    """Both native builds exist: missing multipart file is JSON error + 200/400.

    Require the handler's exact error, not merely a 200 health/default page.
    http.client deliberately bypasses proxy settings for this loopback probe.
    """
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
    try:
        connection.request('POST','/v1/audio/transcriptions',body=b'')
        response=connection.getresponse()
        body=response.read()
        if response.status not in (200,400) or json.loads(body).get('error')!="no 'file' field in the request":
            raise ValueError('Whisper route does not match the gateway contract')
        return {'status':response.status,'error':'missing multipart file rejected','path':'/v1/audio/transcriptions'}
    finally:connection.close()


def restore_paused_workloads(paused):
    """Attempt every restoration, and report stopped/removed IDs for audit."""
    errors=[]
    for item in paused:
        inspected=subprocess.run(['docker','inspect',item['id']],text=True,capture_output=True)
        if inspected.returncode:
            item['resumeStatus']='container unavailable; recovery audit required'
            errors.append('Previously paused workload unavailable: '+item['name'])
            continue
        current=json.loads(inspected.stdout)[0]['State']
        if current['Running'] and current['Paused']:
            resumed=subprocess.run(['docker','unpause',item['id']],capture_output=True)
            item['resumeStatus']='resumed' if resumed.returncode==0 else 'failed'
            if resumed.returncode:errors.append('Could not resume '+item['name'])
        elif current['Running']:item['resumeStatus']='already unpaused'
        else:
            item['resumeStatus']='observed stopped; recovery audit required'
            errors.append('Previously running workload stopped during validation: '+item['name'])
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('release', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--case', required=True, type=Path)
    parser.add_argument('--models', required=True, type=Path)
    parser.add_argument('--api-source-image', help='Explicit local source-build API image config ID, separate from the signed baseline')
    parser.add_argument('--api-source-revision', help='Full source revision label required with --api-source-image')
    parser.add_argument('--chat-model-spec', type=Path, help='Explicit pinned chat-weight experiment; recorded separately from the signed chart defaults')
    parser.add_argument('--whisper-model', required=True, type=Path)
    parser.add_argument('--whisper-server', required=True, type=Path)
    parser.add_argument('--whisper-python', required=True, type=Path)
    parser.add_argument('--llama-server', default=shutil.which('llama-server'))
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--observe-demo', action='store_true', help='Collect all semantic answer failures; final status remains failed if any check fails')
    parser.add_argument('--pause-hibana', action='store_true', help='Only when the operator has authorized temporarily pausing these workloads')
    args = parser.parse_args()
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('This validation profile requires an Apple Silicon Mac')
    if not 2 <= args.repeats <= 20: raise ValueError('Use two to twenty repetitions per concurrency level')
    if bool(args.api_source_image)!=bool(args.api_source_revision):raise ValueError('Both API source image and revision are required')
    api_override=api_source_identity(args.api_source_image,args.api_source_revision) if args.api_source_image else None
    source = cpu.release.sha(args.source)
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()): raise ValueError('Use a new result directory')
    output.mkdir(parents=True, mode=0o700, exist_ok=True)
    output.chmod(0o700)
    helm = os.environ.get('HELM_BIN', 'helm')
    def run(command, **kwargs):
        return subprocess.check_output(command, cwd=ROOT, text=True, **kwargs).strip()
    if CLUSTER in run(['kind','get','clusters']).splitlines():
        raise RuntimeError('The dedicated Mac demo cluster already exists; refusing to replace it')
    for port in (18000,18001,8080,8081,18787,19000):
        with socket.socket() as probe: probe.bind(('127.0.0.1',port))
    manifest = args.release.resolve()/'release.json'
    app_values, _ = cpu.release.verify(manifest, source)
    metadata = cpu.release.validate(json.loads(manifest.read_text()), source)
    app_chart = manifest.parent/metadata['charts']['application']['name']
    inference_chart = manifest.parent/metadata['charts']['inference']['name']
    values = json.loads(run(['node','--input-type=module','-e',"import {parse} from 'yaml';import {readFileSync} from 'node:fs';console.log(JSON.stringify(parse(readFileSync(0,'utf8'))))"],input=run([helm,'show','values',str(inference_chart)])))
    llama_version = run([args.llama_server,'--version'],stderr=subprocess.STDOUT)
    available_devices = run([args.llama_server,'--list-devices'],stderr=subprocess.STDOUT)
    if not re.search(r'MTL0:\s+Apple',available_devices):
        raise ValueError('The pinned native runtime does not expose the Apple Metal device')
    expected_build = values['llamacpp']['image']['tag'].removeprefix('server-b')
    if not re.search(r'build\s+'+re.escape(expected_build)+r'\b',llama_version):
        raise ValueError('Native llama.cpp build differs from the reviewed inference chart')
    override=chat_override(args.chat_model_spec) if args.chat_model_spec else None
    model_paths, identities = {}, {}
    for component in ('chat','embedding','whisper'):
        spec = override if component=='chat' and override else (values['whisper'] if component=='whisper' else values['servers'][component])
        path = args.whisper_model.resolve() if component=='whisper' else (args.models/spec['modelRevision']/spec['modelFile']).resolve()
        if checksum(path)!=spec['modelSha256']:raise ValueError('Model checksum mismatch: '+component)
        model_paths[component]=path
        identities[component]={k:spec[k] for k in ('modelRepo','modelRevision','modelFile','modelSha256')}
    case = json.loads(args.case.read_text())
    media = args.case.resolve().parent/case['file']
    if checksum(media)!=case['sha256']:raise ValueError('Demo media checksum mismatch')
    actual_duration=float(run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(media)]))
    if abs(actual_duration-case['duration'])>.1:raise ValueError('Demo duration differs from the reference manifest')
    refs={c:v['image']['repository']+'@'+v['image']['digest'] for c,v in app_values.items() if c!='requireImageDigests'}
    release_refs=dict(refs)
    if api_override:refs['api']=api_override['imageConfigId']
    tag='mac-demo-'+(api_override['sourceSha'] if api_override else source)[:8]
    anonymous=output/'registry-anonymous';anonymous.mkdir(mode=0o700);(anonymous/'config.json').write_text('{"auths":{}}\n')
    try:
        for component,ref in refs.items():
            if not (api_override and component=='api'):
                subprocess.run(['docker','pull',ref],env={**os.environ,'DOCKER_CONFIG':str(anonymous)},check=True)
            run(['docker','tag',ref,'videoq-'+component+':'+tag])
    finally:
        (anonymous/'config.json').unlink();anonymous.rmdir()
    fixture=json.loads((ROOT/'.github/onprem-lab/dependencies.json').read_text())
    _,backing=cpu.lab.prepare_fixtures(fixture,tag)
    for image in backing.values():
        subprocess.run(['docker','pull',image['reference']],check=True)
        run(['docker','tag',image['reference'],image['alias']])
    subprocess.run(['docker','pull',cpu.NODE],check=True)
    host=run(['docker','run','--rm','--entrypoint','python',refs['worker'],'-c',"import socket;print(socket.gethostbyname('host.docker.internal'))"])
    address=ipaddress.ip_address(host)
    if address.version!=4 or not address.is_private or address.is_loopback:raise ValueError('Expected Docker Desktop private Mac address')
    hardware={'platform':platform.platform(),'architecture':platform.machine(),'memoryBytes':int(run(['sysctl','-n','hw.memsize'])),'logicalCpus':int(run(['sysctl','-n','hw.ncpu'])),'swapBefore':run(['sysctl','-n','vm.swapusage'])}
    (output/'hardware.json').write_text(json.dumps(hardware,indent=2)+'\n')
    network='videoq-mac-demo-'+uuid4().hex[:10]
    kubeconfig=output/'kubeconfig'
    config=output/'kind.json'
    config.write_text(json.dumps({'kind':'Cluster','apiVersion':'kind.x-k8s.io/v1alpha4','networking':{'podSubnet':cpu.POD_SUBNET,'serviceSubnet':cpu.SERVICE_SUBNET},'nodes':[{'role':'control-plane'}]}))
    native_env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','DO_NOT_TRACK':'1','WHISPER_REQUEST_TIMEOUT_SECONDS':'600'}
    env={**os.environ,'HELM_BIN':helm,'KIND_EXPERIMENTAL_DOCKER_NETWORK':network,'KUBECONFIG':str(kubeconfig)}
    paused,processes,handles=[],[],[]
    network_created=False;cluster_created=False;result=None;cleanup=[]
    started=time.monotonic()
    try:
        if args.pause_hibana:
            for line in run(['docker','ps','--format','{{.ID}} {{.Names}}']).splitlines():
                identifier,name=line.split(' ',1)
                if name.startswith('hibana-'):
                    current=json.loads(run(['docker','inspect',identifier]))[0]['State']
                    if current['Running'] and not current['Paused']:
                        run(['docker','pause',identifier]);paused.append({'id':identifier,'name':name})
                        (output/'paused-workloads.json').write_text(json.dumps(paused,indent=2)+'\n')
        commands={
            'chat':[args.llama_server,'--model',str(model_paths['chat']),'--alias',values['servers']['chat']['servedModel'],'--host','127.0.0.1','--port','18000','--ctx-size','8192','--threads','4','--parallel','1','--gpu-layers','99','--offline','--jinja','--reasoning','off'],
            'embedding':[args.llama_server,'--model',str(model_paths['embedding']),'--alias',values['servers']['embedding']['servedModel'],'--host','127.0.0.1','--port','18001','--ctx-size','8192','--threads','2','--parallel','1','--gpu-layers','99','--offline','--embedding','--pooling','last'],
            'whisper':[str(args.whisper_server.resolve()),'--model',str(model_paths['whisper']),'--host','127.0.0.1','--port','8081','--inference-path','/v1/audio/transcriptions','--threads','2','--language','ja'],
            'gateway':[str(args.whisper_python.absolute()),'-m','uvicorn','server:app','--host','127.0.0.1','--port','8080'],
        }
        for name in ('chat','embedding'):
            commands[name] += ['--device','MTL0','--log-verbosity','4']
        (output/'native-runtime.json').write_text(json.dumps({'llamaAvailableDevices':available_devices,'commands':commands},indent=2)+'\n')
        for name,command in commands.items():
            log=(output/(name+'.log')).open('w');handles.append(log)
            process=subprocess.Popen(['sandbox-exec','-p',PROFILE,*command],cwd=ROOT/'apps/inference/whisper',env=native_env,stdout=log,stderr=subprocess.STDOUT)
            processes.append((name,process))
        for port in (18000,18001,8081,8080):
            deadline=time.monotonic()+180
            while True:
                if any(p.poll() is not None for _,p in processes):raise RuntimeError('A native inference process exited; inspect protected local logs')
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=2) as response:
                        if response.status==200:break
                except OSError:pass
                if time.monotonic()>deadline:raise RuntimeError('Native inference readiness timed out')
                time.sleep(1)
        for name in ('chat','embedding','whisper'):
            lines=(output/(name+'.log')).read_text().splitlines()
            if not any('metal' in line.lower() or 'MTL0' in line for line in lines):
                raise RuntimeError('Missing native GPU backend evidence before workload: '+name)
        # A healthy engine can still have the wrong transcription route. An
        # empty POST must reach that handler and fail its multipart validation.
        (output/'whisper-route-probe.json').write_text(json.dumps(probe_whisper_route(),indent=2)+'\n')
        subprocess.run(['sandbox-exec','-p',PROFILE,str(args.whisper_python.absolute()),'-c',"import urllib.request;assert urllib.request.urlopen('http://127.0.0.1:18000/health',timeout=3).status==200\ntry:urllib.request.urlopen('https://1.1.1.1',timeout=2)\nexcept OSError:print('Native loopback works; public egress blocked')\nelse:raise RuntimeError('Public egress allowed')"],check=True)
        run(['docker','network','create',network]);network_created=True
        cluster_created=True
        subprocess.run(['kind','create','cluster','--name',CLUSTER,'--config',str(config),'--image',cpu.NODE,'--kubeconfig',str(kubeconfig),'--wait','180s','--retain'],env=env,check=True)
        def k(*parts):return run(['kubectl','--kubeconfig',str(kubeconfig),'--context','kind-'+CLUSTER,*parts])
        dns=json.loads(k('-n','kube-system','get','configmap','coredns','-o','json'))
        dns['data']['Corefile'],count=re.subn(r'forward\s+\.\s+/etc/resolv.conf\s*\{[^}]*\}','',dns['data']['Corefile'])
        if count!=1:raise RuntimeError('Unexpected DNS configuration')
        subprocess.run(['kubectl','--kubeconfig',str(kubeconfig),'--context','kind-'+CLUSTER,'apply','-f','-'],input=json.dumps(dns),text=True,check=True)
        k('-n','kube-system','rollout','restart','deployment/coredns');k('-n','kube-system','rollout','status','deployment/coredns','--timeout=120s')
        imports=cpu.lab.load_native_images([*[v['alias'] for v in backing.values()],*['videoq-'+c+':'+tag for c in refs]],env,output,cluster=CLUSTER)
        cpu.CLUSTER=CLUSTER
        firewall=cpu.isolate_node(json.loads(run(['docker','network','inspect',network]))[0],host_inference=host)
        log_path=output/'lifecycle.log'
        with log_path.open('w') as log:
            subprocess.run(['python3',str(ROOT/'.github/scripts/onprem-lab.py'),str(kubeconfig),str(output),'--cluster',CLUSTER,'--image-tag',tag,'--chart',str(app_chart),'--real-models','--host-inference-ip',host,'--case',str(args.case.resolve()),'--benchmark-repeats',str(args.repeats),*(['--observe-demo'] if args.observe_demo else [])],env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
        result=json.loads((output/'lifecycle-result.json').read_text())
        transcripts=[result['recognitionAndAnswer']['transcript'],*[trial['transcript'] for round_ in result['benchmark']['rounds'] for trial in round_['results']]]
        result['transcriptionAssessments']=[cpu.assess_transcript(text,case) for text in transcripts]
        native={}
        for name in ('chat','embedding','whisper'):
            lines=[line for line in (output/(name+'.log')).read_text().splitlines() if 'metal' in line.lower() or 'MTL0' in line]
            if not lines:raise RuntimeError('Missing evidence of the Metal backend: '+name)
            native[name]={'metalEvidence':lines[-10:],'model':identities[name]}
        result.update({'sourceSha':api_override['sourceSha'] if api_override else source,'baselineReleaseSource':source,'apiSourceBuild':api_override,'baselineImageReferences':release_refs,'verification':('Signed baseline manifest, both charts and all five indexes verified; worker/web executed by digest; API uses an explicitly recorded local source build' if api_override else 'Signed release manifest, both charts and all five indexes verified; app images executed by digest')+'; native llama.cpp build matched the signed chart; all weights checksum-verified', 'chatModelProfile':'explicit pinned weight experiment' if override else 'signed inference chart default', 'chatModelOverride':override,'hardware':hardware,'nativeInference':native,'llamaVersion':llama_version,'llamaAvailableDevices':available_devices,'whisperBinarySha256':checksum(args.whisper_server.resolve()),'fixtureSha256':case['sha256'],'fixtureDuration':case['duration'],'fixtureKind':'fictional local macOS TTS demo','nativeSandbox':PROFILE,'firewall':firewall,'kindImports':imports,'elapsedSeconds':time.monotonic()-started,'imageReferences':refs,'scope':'Mac M4 Metal and disposable Kubernetes; not NVIDIA hardware acceptance or a customer-video quality/capacity SLA'})
    finally:
        if cluster_created:
            rc=subprocess.run(['kind','delete','cluster','--name',CLUSTER,'--kubeconfig',str(kubeconfig)],env=env).returncode
            if rc:cleanup.append('dedicated cluster removal failed')
        if network_created:
            rc=subprocess.run(['docker','network','rm',network],capture_output=True).returncode
            if rc:cleanup.append('dedicated network removal failed')
        for _,p in reversed(processes):
            if p.poll() is None:
                p.terminate()
                try:p.wait(timeout=10)
                except subprocess.TimeoutExpired:p.kill();p.wait(timeout=10)
        for handle in handles:handle.close()
        cleanup.extend(restore_paused_workloads(paused))
        (output/'cleanup.json').write_text(json.dumps({'errors':cleanup,'temporarilyPausedWorkloads':paused,'nativeProcessesStopped':all(p.poll() is not None for _,p in processes)},indent=2)+'\n')
    if cleanup and result is None:raise RuntimeError('Validation cleanup was incomplete; inspect local cleanup.json')
    if result is not None:
        result['hardware']['swapAfter']=run(['sysctl','-n','vm.swapusage'])
        result['cleanup']=json.loads((output/'cleanup.json').read_text())
        result['failureReasons']=([ 'answer quality' ] if result['answerQuality']['passed']!=result['answerQuality']['total'] else [])+(['cleanup'] if cleanup else [])
        result['status']='failed' if result['failureReasons'] else 'passed'
        result['measurementCompleted']=True
        cpu.release.write_atomic(output/'result.json',result)
        print(json.dumps({'status':result['status'],'answerQuality':result['answerQuality'],'result':str(output/'result.json'),'transcriptionCer':[v['cer'] for v in result['transcriptionAssessments']],'benchmarkRounds':[{k:v for k,v in round_.items() if k!='results'} for round_ in result['benchmark']['rounds']]},ensure_ascii=False,indent=2))

        if result['status']!='passed': raise SystemExit(1)


if __name__=='__main__':main()
