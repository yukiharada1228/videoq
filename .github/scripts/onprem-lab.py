"""Exercise application lifecycle in a dedicated disposable kind cluster.

Requires kind-videoq-onprem-lab and explicit kubeconfig. Backing services and AI
fixtures are test-only. No paid inference or existing site resources are used.
Caller creates and deletes the cluster. Images must already exist in Docker.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
CLUSTER = "videoq-onprem-lab"
NAMESPACE = "videoq-validation"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kubeconfig", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--image-tag", default="onprem-ci")
    parser.add_argument("--chart", default="charts/videoq", help="Reviewed source chart or verified chart archive")
    parser.add_argument("--resume", action="store_true", help="Resume a failed test only in the existing disposable lab")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    helm = os.environ.get("HELM_BIN", "helm")
    env = {**os.environ, "KUBECONFIG": str(args.kubeconfig.resolve())}
    def run(command, data=None, binary=False):
        return subprocess.run(command, cwd=ROOT, env=env, input=data, text=not binary, check=True, stdout=subprocess.PIPE).stdout
    def k(*command, data=None, binary=False):
        return run(["kubectl", "--context", "kind-" + CLUSTER, "-n", NAMESPACE, *command], data=data, binary=binary)
    # Never select an arbitrary current context or touch the operator's config.
    context = run(["kubectl", "config", "current-context"]).strip()
    if context != "kind-" + CLUSTER:
        raise ValueError("Use the explicit disposable lab kubeconfig")
    k("get", "nodes")
    if not args.resume:
        fixture = json.loads((ROOT / ".github/onprem-lab/dependencies.json").read_text())
        k("apply", "-f", "-", data=json.dumps(fixture))
        for name in ["postgres", "garage", "queue"]:
            k("rollout", "status", "deployment/" + name, "--timeout=300s")
    images = ["videoq-" + c + ":" + args.image_tag for c in ["api", "worker", "web"]]
    run(["kind", "load", "docker-image", "--name", CLUSTER, *images])
    if not args.resume:
        k("create", "configmap", "inference-fixture", "--from-file=inference.mjs=" + str(ROOT / ".github/onprem-lab/inference.mjs"))
        service = {"apiVersion":"v1","kind":"Service","metadata":{"name":"inference"},"spec":{"selector":{"app":"inference"},"ports":[{"port":8080}]}}
        deployment = {"apiVersion":"apps/v1","kind":"Deployment","metadata":{"name":"inference"},"spec":{"replicas":1,"selector":{"matchLabels":{"app":"inference"}},"template":{"metadata":{"labels":{"app":"inference"}},"spec":{"containers":[{"name":"inference","image":images[0],"imagePullPolicy":"Never","command":["node","/fixture/inference.mjs"],"volumeMounts":[{"name":"fixture","mountPath":"/fixture"}]}],"volumes":[{"name":"fixture","configMap":{"name":"inference-fixture"}}]}}}}
        k("apply", "-f", "-", data=json.dumps({"apiVersion":"v1","kind":"List","items":[service,deployment]}))
    secret = {"DATABASE_URL":"postgresql://postgres:onprem-validation-only@postgres:5432/postgres",
              "BETTER_AUTH_SECRET":secrets.token_urlsafe(48), "USER_SECRET_ENCRYPTION_KEY":secrets.token_urlsafe(32),
              "R2_ACCESS_KEY_ID":"GK"+"0"*32, "R2_SECRET_ACCESS_KEY":"0"*64,
              "AWS_ACCESS_KEY_ID":"local-lab", "AWS_SECRET_ACCESS_KEY":"local-lab", "OPENAI_API_KEY":"local-lab"}
    def apply_secret():
        k("apply", "-f", "-", data=json.dumps({"apiVersion":"v1","kind":"Secret","metadata":{"name":"videoq-runtime"},"stringData":secret}))
    if args.resume:
        secret = {key:base64.b64decode(value).decode() for key,value in json.loads(k("get","secret","videoq-runtime","-o","json"))["data"].items()}
    else:
        apply_secret()
    values = {"fullnameOverride":"videoq", "publicUrl":"http://127.0.0.1:18787", "storage":{"endpoint":"http://127.0.0.1:19000","internalEndpoint":"http://garage:3900","bucket":"videoq-media","region":"garage"},
              "queue":{"url":"http://queue:9324/000000000000/videoq-jobs"},
              "ai":{"openaiBaseUrl":"http://inference:8080/v1","llmModel":"lab-model","whisperBackend":"local","whisperLocalUrl":"http://inference:8080/v1"},
              "config":{"videoVisualEnabled":False}}
    for component in ["api", "worker", "web"]:
        values[component] = {"image":{"repository":"videoq-"+component,"tag":args.image_tag,"pullPolicy":"Never"},"resources":{"requests":{"cpu":"100m","memory":"128Mi"},"limits":{"memory":"1Gi"}}}
    values["api"].update({"databasePoolMax":2,"rateLimitPoolMax":1})
    values_path = output / "values.json"
    values_path.write_text(json.dumps(values))
    def h(*command):
        return run([helm,*command,"--kube-context","kind-"+CLUSTER,"--namespace",NAMESPACE])
    if not args.resume:
        h("install","videoq",args.chart,"-f",str(values_path),"--wait","--timeout","5m")
    forwards = []
    try:
        for service_name, ports in [("videoq-api","18787:8787"),("garage","19000:3900")]:
            process = subprocess.Popen(["kubectl","--context","kind-"+CLUSTER,"-n",NAMESPACE,"port-forward","service/"+service_name,ports],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            forwards.append(process)
        def ready():
            for _ in range(90):
                try:
                    with urllib.request.urlopen("http://127.0.0.1:18787/ready",timeout=2) as response:
                        if response.status==200: return
                except OSError: pass
                time.sleep(1)
            raise RuntimeError("API readiness timed out")
        ready()
        video = run(["docker","run","--rm","--entrypoint","ffmpeg",images[1],"-v","error","-f","lavfi","-i","color=c=blue:s=160x120:d=2","-f","lavfi","-i","sine=frequency=440:duration=2","-shortest","-c:v","libx264","-c:a","aac","-movflags","frag_keyframe+empty_moov","-f","mp4","pipe:1"],binary=True)
        video_path = output / "video.mp4"
        video_path.write_bytes(video)
        state_path = output / "e2e-state.json"
        def e2e(mode):
            print(run(["node",".github/onprem-lab/e2e.mjs",mode,str(state_path),str(video_path)]),flush=True)
        if not args.resume:
            account = json.loads(k("exec","deployment/videoq-api","--","node","dist/provision-user.mjs","--admin","--username","onprem_lab","--email","onprem-lab@example.com"))
            state_path.write_text(json.dumps(account))
            state_path.chmod(0o600)
            e2e("register")
        k("exec","deployment/videoq-api","--","node","scripts/create-admin.mjs","onprem-lab@example.com")
        e2e("upload")
        # Test object backup, deletion and restoration through the real S3 API.
        storage_test = '''import hashlib
from contextlib import closing
from worker_python.pipeline.storage import _s3_client,_bucket
with closing(_s3_client()) as c:
 b=_bucket(); objects=c.list_objects_v2(Bucket=b).get('Contents',[])
 assert objects
 for o in objects:
  key=o['Key']; data=c.get_object(Bucket=b,Key=key)['Body'].read(); expected=hashlib.sha256(data).hexdigest()
  c.delete_object(Bucket=b,Key=key)
  assert not c.list_objects_v2(Bucket=b,Prefix=key).get('Contents')
  c.put_object(Bucket=b,Key=key,Body=data,ContentType='video/mp4')
  assert hashlib.sha256(c.get_object(Bucket=b,Key=key)['Body'].read()).hexdigest()==expected
print('S3 object backup/delete/restore checksum passed')'''
        print(k("exec","deployment/videoq-worker","--","python","-c",storage_test),flush=True)
        for cron in ["videoq-maintenance","videoq-retention"]:
            k("patch","cronjob",cron,"--type=merge","-p",'{"spec":{"suspend":true}}')
        k("scale","deployment/videoq-api","deployment/videoq-worker","--replicas=0")
        for label in ["api", "worker"]:
            k("wait","--for=delete","pod","-l","app.kubernetes.io/component="+label,"--timeout=180s")
        backup = k("exec","deployment/postgres","--","pg_dump","-U","postgres","-Fc","postgres",binary=True)
        (output/"database.dump").write_bytes(backup)
        k("exec","deployment/postgres","--","createdb","-U","postgres","restored")
        k("exec","-i","deployment/postgres","--","pg_restore","-U","postgres","--exit-on-error","--no-owner","-d","restored",data=backup,binary=True)
        secret["DATABASE_URL"] = secret["DATABASE_URL"].removesuffix("postgres") + "restored"
        apply_secret()
        h("upgrade","videoq",args.chart,"-f",str(values_path),"--set","api.replicas=2","--wait","--timeout","5m")
        # A port-forward belongs to a Pod. Restart it after replacing all API Pods.
        forwards[0].terminate(); forwards[0].wait(timeout=10)
        forwards[0] = subprocess.Popen(["kubectl","--context","kind-"+CLUSTER,"-n",NAMESPACE,"port-forward","service/videoq-api","18787:8787"],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        ready(); e2e("restore-and-upgrade")
        h("test","videoq","--timeout","120s")
        h("rollback","videoq","1","--wait","--timeout","5m")
        forwards[0].terminate(); forwards[0].wait(timeout=10)
        forwards[0] = subprocess.Popen(["kubectl","--context","kind-"+CLUSTER,"-n",NAMESPACE,"port-forward","service/videoq-api","18787:8787"],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        ready(); e2e("rollback")
        k("create","job","lab-retention","--from=cronjob/videoq-retention")
        k("wait","--for=condition=complete","job/lab-retention","--timeout=120s")
        report = {"uploadTranscriptionIndexingAndQa":"passed", "inference":"deterministic HTTP protocol fixture; no model quality evaluation", "objectRestore":"passed; SHA256 identical", "databaseRestore":"passed; restored to a separate database and app switched", "upgrade":"passed; two API replicas and migration hook", "rollback":"passed; one API replica, restored DB and data retained", "helmTest":"passed", "retention":"passed", "images":images, "databaseBackupSha256":hashlib.sha256(backup).hexdigest()}
        (output/"result.json").write_text(json.dumps(report,indent=2)+"\n")
        print(json.dumps(report,indent=2),flush=True)
    finally:
        for process in forwards:
            process.terminate()
            process.wait(timeout=10)


if __name__ == "__main__":
    main()
