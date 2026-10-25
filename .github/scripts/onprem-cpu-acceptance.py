"""Rehearse a verified release with real CPU models, without public serving egress.

Runs only in a new dedicated kind-videoq-onprem-lab cluster. Public model/image
downloads finish before creating its internal Docker network. No site resources
or existing Docker networks are modified. Requires Helm, kind, kubectl, Node
with the repository's yaml/playwright packages, Chromium and authenticated gh.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
CLUSTER = "videoq-onprem-lab"
NODE = "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5"
SPEC = importlib.util.spec_from_file_location("release", Path(__file__).with_name("onprem-release.py"))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
METRICS_SPEC = importlib.util.spec_from_file_location("metrics", ROOT / "apps/worker/scripts/whisper_runtime_validation.py")
metrics = importlib.util.module_from_spec(METRICS_SPEC)
METRICS_SPEC.loader.exec_module(metrics)


def assess_transcript(transcript, case):
    def seconds(value):
        hours, minutes, rest = value.replace(",", ".").split(":")
        return int(hours)*3600+int(minutes)*60+float(rest)
    pattern = r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s*\n(.*?)(?=\n\s*\n|\Z)"
    rows = [{"start":seconds(start),"end":seconds(end),"text":text.strip()} for start,end,text in re.findall(pattern,transcript,re.S)]
    result = metrics.assess_response({"segments":rows}, case)
    if result["errors"] or result["cer"] is None or result["cer"] >= .25:
        raise ValueError("Public Japanese transcript failed timestamp/CER acceptance: "+json.dumps(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("release", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = release.sha(args.source)
    manifest = args.release.resolve() / "release.json"
    application, inference = release.verify(manifest, source)
    metadata = release.validate(json.loads(manifest.read_text()), source)
    app_chart = manifest.parent / metadata["charts"]["application"]["name"]
    inference_chart = manifest.parent / metadata["charts"]["inference"]["name"]
    references = {c: v["image"]["repository"]+"@"+v["image"]["digest"] for c,v in application.items() if c != "requireImageDigests"}
    references["whisper"] = inference["whisper"]["image"]["repository"]+"@"+inference["whisper"]["image"]["digest"]
    result = rehearse(source, app_chart, inference_chart, args.output, references)
    result["verification"] = "Signed release manifest, both charts and all five image indexes verified before rehearsal"
    release.write_atomic(args.output / "result.json", result)


def rehearse(source, app_chart, inference_chart, output, references, *, local_builds=False):
    """Shared test runner. PR CI uses local builds; only main() verifies releases."""
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    helm = os.environ.get("HELM_BIN", "helm")
    def run(command, **kwargs):
        return subprocess.check_output(command, cwd=ROOT, text=True, **kwargs).strip()
    if CLUSTER in run(["kind", "get", "clusters"]).splitlines():
        raise RuntimeError("The disposable acceptance cluster already exists; refusing to replace it")
    # Read model identities from the supplied chart, not duplicated defaults.
    values = json.loads(run(["node", "--input-type=module", "-e",
                             "import {parse} from 'yaml'; import {readFileSync} from 'node:fs'; console.log(JSON.stringify(parse(readFileSync(0,'utf8'))))"],
                            input=run([helm,"show","values",str(inference_chart)])))
    models = output / "models"
    models.mkdir(exist_ok=True)
    models.chmod(0o777)  # Public test weights; provisioner/pods run as UID 10001.
    references = dict(references)
    references["llamacpp"] = values["llamacpp"]["image"]["repository"]+"@"+release.digest(values["llamacpp"]["image"]["digest"])
    # Pull anonymously even when the operator's default Docker config is logged in.
    anonymous = output / ("anonymous-"+uuid4().hex)
    anonymous.mkdir(mode=0o700)
    (anonymous/"config.json").write_text('{"auths":{}}\n')
    public_env = {**os.environ, "DOCKER_CONFIG": str(anonymous)}
    try:
        image_ids = {}
        for component, reference in references.items():
            if not local_builds or component == "llamacpp":
                subprocess.run(["docker","pull",reference],env=public_env,check=True)
            run(["docker","tag",reference,"videoq-"+component+":onprem-ci"])
            image_ids[component] = run(["docker","image","inspect",reference,"--format","{{.Id}}"])
        if json.loads((anonymous/"config.json").read_text()) != {"auths":{}}:
            raise RuntimeError("Anonymous registry configuration was changed")
    finally:
        (anonymous/"config.json").unlink(missing_ok=True)
        anonymous.rmdir()
    identities = {}
    for component in ["chat","embedding","whisper"]:
        model = values["whisper"] if component == "whisper" else values["servers"][component]
        command = ["docker","run","--rm","--mount","type=bind,src="+str(models)+",dst=/models","--entrypoint","python"]
        for key, field in [("MODEL_REPO","modelRepo"),("MODEL_REVISION","modelRevision"),("MODEL_FILE","modelFile"),("MODEL_SHA256","modelSha256")]:
            command += ["-e",key+"="+model[field]]
        command += ["-e","HF_HUB_OFFLINE=0",references["whisper"],"provision.py"]
        subprocess.run(command,check=True)
        path = models / model["modelRevision"] / model["modelFile"]
        with path.open("rb") as stream:
            checksum = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024*1024), b""): checksum.update(chunk)
        if checksum.hexdigest() != model["modelSha256"]:
            raise ValueError("Provisioned model checksum differs from the signed chart")
        identities[component] = {k:model[k] for k in ("modelRepo","modelRevision","modelFile","modelSha256")}
    clip = ROOT / "apps/inference/whisper/tests/fixtures/fleurs-ja-00.mp3"
    case = json.loads(clip.with_suffix(".json").read_text())
    if hashlib.sha256(clip.read_bytes()).hexdigest() != case["sha256"]:
        raise ValueError("Public Japanese acceptance fixture checksum mismatch")
    fixture = json.loads((ROOT/".github/onprem-lab/dependencies.json").read_text())
    dependencies = [c["image"] for item in fixture["items"] if item["kind"] == "Deployment" for c in item["spec"]["template"]["spec"]["containers"]]
    for reference in [NODE,*dependencies]:
        subprocess.run(["docker","pull",reference],check=True)
    network = "videoq-cpu-acceptance-"+uuid4().hex[:12]
    kubeconfig = output / "kubeconfig"
    config = output / "kind.json"
    config.write_text(json.dumps({"kind":"Cluster","apiVersion":"kind.x-k8s.io/v1alpha4",
                                 "nodes":[{"role":"control-plane","extraMounts":[{"hostPath":str(models),"containerPath":"/videoq-models","readOnly":True}]}]}))
    created = False
    run(["docker","network","create","--internal",network])
    started = time.monotonic()
    env = {**os.environ,"KIND_EXPERIMENTAL_DOCKER_NETWORK":network,"KUBECONFIG":str(kubeconfig)}
    try:
        # Kind may leave a node behind on failure; cleanup also covers that case.
        created = True
        subprocess.run(["kind","create","cluster","--name",CLUSTER,"--config",str(config),"--image",NODE,"--kubeconfig",str(kubeconfig),"--wait","180s"],env=env,check=True)
        node_networks = json.loads(run(["docker","inspect",CLUSTER+"-control-plane"]))[0]["NetworkSettings"]["Networks"]
        if set(node_networks) != {network} or not json.loads(run(["docker","network","inspect",network]))[0]["Internal"]:
            raise RuntimeError("Acceptance node must attach only to its dedicated internal network")
        def k(*command):
            return run(["kubectl","--kubeconfig",str(kubeconfig),"--context","kind-"+CLUSTER,*command])
        dns = json.loads(k("-n","kube-system","get","configmap","coredns","-o","json"))
        dns["data"]["Corefile"], count = re.subn(r"forward\s+\.\s+/etc/resolv.conf\s*\{[^}]*\}","",dns["data"]["Corefile"])
        if count != 1: raise RuntimeError("Unexpected CoreDNS config; cannot guarantee public DNS is blocked")
        subprocess.run(["kubectl","--kubeconfig",str(kubeconfig),"--context","kind-"+CLUSTER,"apply","-f","-"],input=json.dumps(dns),text=True,check=True)
        k("-n","kube-system","rollout","restart","deployment/coredns")
        k("-n","kube-system","rollout","status","deployment/coredns","--timeout=120s")
        subprocess.run(["kind","load","docker-image","--name",CLUSTER,*dependencies,*["videoq-"+c+":onprem-ci" for c in references]],env=env,check=True)
        subprocess.run(["python3",str(ROOT/".github/scripts/onprem-lab.py"),str(kubeconfig),str(output),"--chart",str(app_chart),
                        "--real-models","--inference-chart",str(inference_chart)],env=env,check=True)
        result = json.loads((output / "lifecycle-result.json").read_text())
        result["transcriptionAssessment"] = assess_transcript(result["recognitionAndAnswer"]["transcript"], case)
        result.update({"sourceSha":source,"imageReferences":references,"nativeImageIds":image_ids,"models":identities,
                       "elapsedSeconds":time.monotonic()-started,"fixtureSha256":case["sha256"],
                       "networkBoundary":"Docker --internal plus CoreDNS without external forwarding; not a CNI enforcement test"})
        return result
    finally:
        if created:
            subprocess.run(["kind","delete","cluster","--name",CLUSTER,"--kubeconfig",str(kubeconfig)],env=env,check=True)
        run(["docker","network","rm",network])


if __name__ == "__main__":
    main()
