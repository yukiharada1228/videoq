"""Assemble signed release metadata, or verify it before producing Helm values.

Uses the operator's authenticated gh CLI. Verification fails closed; no cluster
changes are made. Trust this script from a reviewed checkout, never a bundle.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

REPOSITORY = "yukiharada1228/videoq"
WORKFLOW = REPOSITORY + "/.github/workflows/onprem-release.yml"
COMPONENTS = ("api", "worker", "web")
PREFIX = "ghcr.io/" + REPOSITORY + "-"


def sha(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{40}", value):
        raise ValueError("An exact reviewed source commit SHA is required")
    return value


def digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", value):
        raise ValueError("An immutable SHA-256 digest is required")
    if value == "sha256:" + "0" * 64:
        raise ValueError("Placeholder digests are not deployable")
    return value


def validate(data, expected_sha):
    sha(expected_sha)
    if data.get("schemaVersion") != 1 or data.get("repository") != REPOSITORY or data.get("sourceSha") != expected_sha:
        raise ValueError("Release repository or source commit does not match the reviewed source")
    if data.get("platforms") != ["linux/amd64", "linux/arm64"] or set(data.get("images", {})) != set(COMPONENTS):
        raise ValueError("Release must include all components and both supported architectures")
    for component in COMPONENTS:
        image = data["images"][component]
        if image.get("repository") != PREFIX + component:
            raise ValueError("Unexpected image repository")
        digest(image.get("digest"))
    chart = data.get("chart", {})
    if chart.get("name") != "videoq-0.1.0-sha." + expected_sha + ".tgz":
        raise ValueError("Unexpected chart filename")
    digest(chart.get("digest"))
    return data


def attest(target, source, predicate=None):
    command = ["gh", "attestation", "verify", str(target), "--repo", REPOSITORY,
               "--signer-workflow", WORKFLOW, "--source-ref", "refs/heads/main",
               "--source-digest", sha(source), "--deny-self-hosted-runners"]
    if predicate:
        command += ["--predicate-type", predicate]
    # Do not shell-expand release metadata. gh verifies the signature, subject,
    # GitHub OIDC identity and source revision, not just an embedded predicate.
    subprocess.run(command, check=True)


def verify(manifest, source):
    attest(manifest, source)
    data = validate(json.loads(manifest.read_text()), source)
    chart = manifest.parent / data["chart"]["name"]
    if "sha256:" + hashlib.sha256(chart.read_bytes()).hexdigest() != data["chart"]["digest"]:
        raise ValueError("Chart bytes do not match the signed release")
    attest(chart, source)
    for component in COMPONENTS:
        image = data["images"][component]
        attest("oci://" + image["repository"] + "@" + image["digest"], source)
    return {"requireImageDigests": True, **{
        c: {"image": {**data["images"][c], "tag": "", "pullPolicy": "IfNotPresent"}}
        for c in COMPONENTS}}


def write_atomic(path, data):
    path = path.resolve()
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            json.dump(data, output, indent=2)
            output.write("\n")
            output.close()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("assemble")
    create.add_argument("source")
    create.add_argument("directory", type=Path)
    check = sub.add_parser("verify")
    check.add_argument("source")
    check.add_argument("manifest", type=Path)
    check.add_argument("output", type=Path)
    args = parser.parse_args()
    sha(args.source)
    if args.command == "verify":
        if args.output.resolve() == args.manifest.resolve():
            raise ValueError("Output must not overwrite the signed manifest")
        write_atomic(args.output, verify(args.manifest, args.source))
        print("Verified release; Helm image values written to " + str(args.output))
        return
    chart = args.directory / ("videoq-0.1.0-sha." + args.source + ".tgz")
    data = {"schemaVersion": 1, "repository": REPOSITORY, "sourceSha": args.source,
            "platforms": ["linux/amd64", "linux/arm64"],
            "images": {c: {"repository": PREFIX + c,
                           "digest": (args.directory / (c + ".digest")).read_text().strip()} for c in COMPONENTS},
            "chart": {"name": chart.name, "digest": "sha256:" + hashlib.sha256(chart.read_bytes()).hexdigest()}}
    write_atomic(args.directory / "release.json", validate(data, args.source))


if __name__ == "__main__":
    main()
